import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import AWSHttpGateway from "./gateway";
import { createFromBastionIngressRule } from "./securityGroups";
import AWSBastion from "./bastion";

import {
    regionalVpc,
    externalSubnet,
    internalSubnet,
    peerVpcs,
    acceptVpcPeeringRequest
} from "./network";

export default class AWSRegionalDeployment {
    readonly deploymentName: string;

    readonly provider: aws.Provider;
    readonly region: aws.Region;
    readonly availabilityZone: pulumi.Output<string>;
    readonly defaultAmi: pulumi.Output<string>;

    readonly internalFacingSubnet: aws.ec2.Subnet;
    readonly externalFacingSubnet: aws.ec2.Subnet;
    readonly vpc: aws.ec2.Vpc;

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
        defaultSize?: aws.ec2.InstanceType
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

        // Pick an AZ in our region for deployments
        // TO DO: Split multiple servers of the same type across AZs
        const availableAZs = pulumi.output(
            aws.getAvailabilityZones({}, { provider: this.provider })
        );
        this.availabilityZone = availableAZs.apply(
            availableAZs => availableAZs.names[0]
        );

        // Use the default size if we haven't been given one
        if (defaultSize != undefined) {
            this.defaultSize = defaultSize;
        }

        // Find the latest CentOS 7 AMI in this region
        this.defaultAmi = pulumi.output(
            aws.getAmi(
                {
                    filters: [
                        {
                            name: "name",
                            values: ["CentOS Linux 7 x86_64 HVM EBS*"]
                        },
                        {
                            name: "virtualization-type",
                            values: ["hvm"]
                        }
                    ],
                    mostRecent: true,
                    owners: ["679593333241"]
                },
                { provider: this.provider }
            )
        ).id;

        this.vpc = regionalVpc(
            deploymentName,
            this.provider,
            this.region,
            vpcCidr
        );

        this.externalFacingSubnet = externalSubnet(
            deploymentName,
            this.provider,
            this.region,
            this.availabilityZone,
            externalFacingSubnet,
            this.vpc
        );

        this.internalFacingSubnet = internalSubnet(
            deploymentName,
            this.provider,
            this.region,
            this.availabilityZone,
            internalFacingSubnet,
            this.vpc
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
            this.defaultAmi
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
        //sourceRegion: aws.Region
    ) {
        let acceptedPeer = acceptVpcPeeringRequest(
            this.deploymentName,
            this.provider,
            this.region,
            this.vpc,
            this.internalFacingSubnet,
            this.externalFacingSubnet,
            peerDeployment,
            peeringRequest
        );

        this.peerDeployments.push(peerDeployment);
    }
}
