import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { readFileSync } from "fs";

import AWSHttpGateway from "./gateway";
import { createFromBastionIngressRule } from "./securityGroups";
import AWSBastion from "./bastion";
import { findLatestUbuntu1804 } from "./ami";

import {
    regionalVpc,
    externalSubnet,
    internalSubnet,
    createNATGateway,
    createInternetGateway,
    createRouteTable,
    peerVpcs,
    acceptVpcPeeringRequest,
    subdivideIpv6Subnet,
    createIpv6EgressGateway
} from "./network";

declare var process: {
    env: {
        PULUMI_SSH_PUBKEY: string;
        USER: string;
    };
};

export default class AWSRegionalDeployment {
    readonly deploymentName: string;

    readonly provider: aws.Provider;
    readonly region: aws.Region;
    readonly availabilityZone: pulumi.Output<string>;
    readonly defaultAmi: pulumi.Output<string>;

    readonly internalFacingSubnet: aws.ec2.Subnet;
    readonly externalFacingSubnet: aws.ec2.Subnet;
    readonly vpc: aws.ec2.Vpc;
    readonly internalRouteTable: aws.ec2.RouteTable;
    readonly externalRouteTable: aws.ec2.RouteTable;
    readonly ipv6Enabled: boolean = false;
    readonly vpcIpv6Cidr: pulumi.Output<string>;
    readonly externalSubnetIpv6Cidr: pulumi.Output<string>;
    readonly internalSubnetIpv6Cidr: pulumi.Output<string>;
    readonly ipv6EgressGateway: aws.ec2.EgressOnlyInternetGateway;

    readonly keyPair: aws.ec2.KeyPair;

    defaultSize: aws.ec2.InstanceType = "t2.micro";

    applyToAllSecurityGroups: Array<pulumi.Output<string>> = [];
    peerDeployments: Array<AWSRegionalDeployment> = [];

    serverList: Array<aws.ec2.Instance> = [];
    httpGateways: Array<aws.ec2.Instance>;

    constructor(
        deploymentName: string,
        region: aws.Region,
        vpcCidr: string,
        internalFacingSubnet: string,
        externalFacingSubnet: string,
        //defaultSize?: aws.ec2.InstanceType,
        ipv6Enabled: boolean = false
    ) {
        this.region = region;
        this.deploymentName = deploymentName;

        // Create an AWS provider for this region
        this.provider = new aws.Provider(
            `${deploymentName}-provider-${region}`,
            {
                region: region
            }
        );

        let keyName = process.env.USER;

        let pubKey: string = readFileSync(
            process.env.PULUMI_SSH_PUBKEY
        ).toString();

        this.keyPair = new aws.ec2.KeyPair(
            `${deploymentName}-${keyName}-${region}`,
            { publicKey: pubKey },
            { provider: this.provider }
        );

        // Pick an AZ in our region for deployments
        // TO DO: Split multiple servers of the same type across AZs
        const availableAZs = pulumi.output(
            aws.getAvailabilityZones({}, { provider: this.provider })
        );
        this.availabilityZone = availableAZs.apply(
            availableAZs => availableAZs.names[0]
        );

        // Use the default size if we haven't been given one
        //if (defaultSize != undefined) {
        //    this.defaultSize = defaultSize;
        //}

        this.defaultAmi = findLatestUbuntu1804(this.provider);

        this.ipv6Enabled = ipv6Enabled;

        this.vpc = regionalVpc(
            deploymentName,
            this.provider,
            this.region,
            vpcCidr,
            ipv6Enabled
        );

        if (ipv6Enabled) {
            this.vpcIpv6Cidr = this.vpc.ipv6CidrBlock;
            this.externalSubnetIpv6Cidr = subdivideIpv6Subnet(
                this.vpc.ipv6CidrBlock,
                0
            );
            this.internalSubnetIpv6Cidr = subdivideIpv6Subnet(
                this.vpc.ipv6CidrBlock,
                1
            );
        }

        this.externalFacingSubnet = externalSubnet(
            deploymentName,
            this.provider,
            this.region,
            this.availabilityZone,
            externalFacingSubnet,
            this.vpc,
            this.externalSubnetIpv6Cidr
        );

        let internetGateway = createInternetGateway(
            deploymentName,
            this.provider,
            this.region,
            this.vpc
        );

        this.externalRouteTable = createRouteTable(
            deploymentName,
            this.provider,
            this.region,
            this.externalFacingSubnet,
            this.vpc,
            internetGateway,
            "external",
            ipv6Enabled
        );

        this.internalFacingSubnet = internalSubnet(
            deploymentName,
            this.provider,
            this.region,
            this.availabilityZone,
            internalFacingSubnet,
            this.vpc,
            this.internalSubnetIpv6Cidr
        );

        if (ipv6Enabled) {
            this.ipv6EgressGateway = createIpv6EgressGateway(
                this.deploymentName,
                this.provider,
                this.region,
                this.vpc
            );
        }

        let natGateway = createNATGateway(
            deploymentName,
            this.provider,
            this.region,
            this.internalFacingSubnet
        );

        this.internalRouteTable = createRouteTable(
            deploymentName,
            this.provider,
            this.region,
            this.internalFacingSubnet,
            this.vpc,
            natGateway,
            "internal",
            ipv6Enabled,
            this.ipv6EgressGateway
        );
    }

    deployBastion() {
        let bastion = AWSBastion(
            this.deploymentName,
            this.provider,
            this.vpc,
            this.region,
            this.externalFacingSubnet,
            this.defaultSize,
            this.defaultAmi,
            this.keyPair
        );
        this.serverList.push(bastion);

        // set the bastion as ourselves
        this.setBastion(bastion);

        return bastion;
    }

    setBastion(bastion: aws.ec2.Instance) {
        let bastionIngressRule = createFromBastionIngressRule(
            this.deploymentName,
            this.provider,
            this.vpc,
            this.region,
            bastion
        );

        this.applyToAllSecurityGroups = [bastionIngressRule.id];
    }

    deployGateway() {
        let gateway = AWSHttpGateway(
            this.deploymentName,
            this.provider,
            this.vpc,
            this.region,
            this.externalFacingSubnet,
            this.defaultSize,
            this.defaultAmi,
            1,
            this.keyPair,
            this.applyToAllSecurityGroups
        );

        // Use the spread operator
        // Add all the HTTP gateways to our server list (which starts out
        // empty)
        this.serverList = [...gateway];
    }

    peerWith(targetVpc: aws.ec2.Vpc, targetRegion: aws.Region) {
        let peeredVpc = peerVpcs(
            this.deploymentName,
            this.provider,
            this.vpc,
            this.region,
            targetVpc,
            targetRegion
        );

        return peeredVpc;
    }

    acceptPeerRequest(
        peeringRequest: aws.ec2.VpcPeeringConnection,
        peerDeployment: AWSRegionalDeployment
    ) {
        let acceptedPeer = acceptVpcPeeringRequest(
            this.deploymentName,
            this.provider,
            this.region,
            this.vpc,
            this.internalFacingSubnet,
            this.externalFacingSubnet,
            this.internalRouteTable,
            this.externalRouteTable,
            peerDeployment,
            peeringRequest
        );

        this.peerDeployments.push(peerDeployment);
    }
}
