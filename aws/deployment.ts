import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import AWSHttpGateway from "./gateway";
import AWSBaseSecurityGroups from "./securityGroups";
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
    defaultSize: aws.ec2.InstanceType = "t2.micro";
    readonly defaultAmi: pulumi.Output<string>;

    readonly internalFacingSubnet: aws.ec2.Subnet;
    readonly externalFacingSubnet: aws.ec2.Subnet;
    readonly vpc: aws.ec2.Vpc;

    readonly baseSecurityGroups: AWSBaseSecurityGroups;
    applyToAllSecurityGroups: Array<pulumi.Output<string>>;

    serverList: Array<aws.ec2.Instance>;
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

        this.provider = new aws.Provider(`provider-${region}`, {
            region: region
        });

        const availableAZs = pulumi.output(
            aws.getAvailabilityZones({}, { provider: this.provider })
        );
        this.availabilityZone = availableAZs.apply(
            availableAZs => availableAZs.names[0]
        );

        if (defaultSize != undefined) {
            this.defaultSize = defaultSize;
        }

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

        this.baseSecurityGroups = new AWSBaseSecurityGroups(
            deploymentName,
            this.provider,
            this.region
        );

        this.applyToAllSecurityGroups = [
            this.baseSecurityGroups
                .allow_ssh_from_bastion_ingress_security_group.name
        ];

        let gatewaySecurityGroups = [
            ...this.applyToAllSecurityGroups,
            this.baseSecurityGroups.http_ingress_security_group.name
        ];

        this.httpGateways = AWSHttpGateway(
            this.deploymentName,
            this.provider,
            this.vpc,
            this.region,
            gatewaySecurityGroups,
            this.externalFacingSubnet,
            this.defaultSize,
            this.defaultAmi,
            1
        );

        // Use the spread operator
        // Add all the HTTP gateways to our server list (which starts out
        // empty)
        this.serverList = [...this.httpGateways];
    }

    deployBastion() {
        let bastion = AWSBastion(
            this.deploymentName,
            this.provider,
            this.vpc,
            this.region,
            this.baseSecurityGroups.ssh_ingress_security_group,
            this.externalFacingSubnet,
            this.defaultSize,
            this.defaultAmi
        );
        this.serverList.push(bastion);
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

    acceptPeerRequest(peeringRequest: aws.ec2.VpcPeeringConnection, sourceRegion: aws.Region) {
        let acceptedPeer = acceptVpcPeeringRequest(this.deploymentName, this.provider, this.region, sourceRegion, peeringRequest);
    }


}
