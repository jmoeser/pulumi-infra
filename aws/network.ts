import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export function regionalVpc(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    vpcCidr: string
) {
    const vpc = new aws.ec2.Vpc(
        `${deploymentName}-${region}-vpc`,
        {
            cidrBlock: vpcCidr,
            tags: {
                Name: `${deploymentName}-${region}-vpc`,
                Deployment: deploymentName
            }
        },
        {
            provider: provider
        }
    );

    let internetGateway = new aws.ec2.InternetGateway(
        `${deploymentName}-${region}-internet-gateway`,
        {
            tags: {
                Name: `${deploymentName}-${region}-internet-gateway`,
                Deployment: deploymentName
            },
            vpcId: vpc.id
        },
        {
            provider: provider
        }
    );

    return vpc;
}

export function externalSubnet(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    availabilityZone: pulumi.Output<string>,
    subnet: string,
    vpc: aws.ec2.Vpc
) {
    return new aws.ec2.Subnet(
        `${deploymentName}-${region}-external-subnet`,
        {
            cidrBlock: subnet,
            availabilityZone: availabilityZone,
            tags: {
                Name: `${deploymentName}-${region}-external-subnet`,
                Facing: "external",
                Deployment: deploymentName
            },
            vpcId: vpc.id
        },
        {
            provider: provider
        }
    );
}

export function internalSubnet(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    availabilityZone: pulumi.Output<string>,
    subnet: string,
    vpc: aws.ec2.Vpc
) {
    // const secondaryCidrAssoc = new aws.ec2.VpcIpv4CidrBlockAssociation(
    //     `${deploymentName}-${region}-secondary-cidr`,
    //     {
    //         cidrBlock: subnet,
    //         vpcId: vpc.id
    //     },
    //     {
    //         provider: provider
    //     }
    // );

    const vpcSubnet = new aws.ec2.Subnet(
        `${deploymentName}-${region}-internal-subnet`,
        {
            cidrBlock: subnet,
            availabilityZone: availabilityZone,
            tags: {
                Name: `${deploymentName}-${region}-internal-subnet`,
                Facing: "internal",
                Deployment: deploymentName
            },
            vpcId: vpc.id
        },
        {
            provider: provider
        }
    );

    const natEip = new aws.ec2.Eip(
        `${deploymentName}-${region}-nat-gw-ip`,
        {
            vpc: true
        },
        {
            provider: provider
        }
    );

    const natGateway = new aws.ec2.NatGateway(
        `${deploymentName}-${region}-nat-gw`,
        {
            allocationId: natEip.id,
            subnetId: vpcSubnet.id,
            tags: {
                Name: `${deploymentName}-${region}-nat-gw`,
                Deployment: deploymentName
            }
        },
        {
            provider: provider
        }
    );

    return vpcSubnet;
}

export function peerVpcs(
    deploymentName: string,
    provider: aws.Provider,
    vpcA: aws.ec2.Vpc,
    regionA: aws.Region,
    vpcB: aws.ec2.Vpc,
    regionB: aws.Region
) {
    return new aws.ec2.VpcPeeringConnection(
        `${deploymentName}-network-peering-${regionA}-to-${regionB}`,
        {
            //autoAccept: true,
            vpcId: vpcA.id,
            peerVpcId: vpcB.id,
            peerRegion: regionB,
            accepter: {
                allowRemoteVpcDnsResolution: true
            },
            requester: {
                allowRemoteVpcDnsResolution: true
            },
            tags: {
                Name:
                    `${deploymentName}-network-peering-${regionA}-to-${regionB}`,
                Deployment: deploymentName
            }
        },
        {
            provider: provider
        }
    );

    // need to create routes
}

export function acceptVpcPeeringRequest(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    sourceRegion: aws.Region,
    peeringConnection: aws.ec2.VpcPeeringConnection
) {
    return new aws.ec2.VpcPeeringConnectionAccepter(
        `${deploymentName}-network-peering-${region}-to-${sourceRegion}`,
        {
            autoAccept: true,
            vpcPeeringConnectionId: peeringConnection.id,
        },
        {
            provider: provider
        }
    );
}
