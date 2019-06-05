import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import AWSRegionalDeployment from "./deployment";

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
            //assignIpv6AddressOnCreation: true,
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

    const internalRouteTable = new aws.ec2.RouteTable(
        `${deploymentName}-${region}-internal-subnet-routes`,
        {
            routes: [
                {
                    cidrBlock: "0.0.0.0/0",
                    gatewayId: natGateway.id
                }
                // {
                //     egressOnlyGatewayId: aws_egress_only_internet_gateway_foo.id,
                //     ipv6CidrBlock: "::/0",
                // },
            ],
            tags: {
                Name: `${deploymentName}-${region}-internal-subnet-routes`,
                Deployment: deploymentName
            },
            vpcId: vpc.id
        },
        {
            provider: provider
        }
    );

    const internalRouteTableAssociation = new aws.ec2.RouteTableAssociation(
        `${deploymentName}-${region}-internal-subnet-route-assoc`,
        {
            routeTableId: internalRouteTable.id,
            subnetId: vpcSubnet.id
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
            // Can't auto-accept since it's between regions
            //autoAccept: true,
            vpcId: vpcA.id,
            peerVpcId: vpcB.id,
            peerRegion: regionB,
            // Can't seem to turn these on at this stage, since
            // the connection hasn't been accepted/created
            // accepter: {
            //     allowRemoteVpcDnsResolution: true
            // },
            // requester: {
            //     allowRemoteVpcDnsResolution: true
            // },
            tags: {
                Name: `${deploymentName}-network-peering-${regionA}-to-${regionB}`,
                Deployment: deploymentName
            }
        },
        {
            provider: provider
        }
    );

    // https://pulumi.io/reference/pkg/nodejs/pulumi/aws/ec2/#getSubnetIds

    // need to create routes
}

export function acceptVpcPeeringRequest(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    vpc: aws.ec2.Vpc,
    peerDeployment: AWSRegionalDeployment,
    peeringConnection: aws.ec2.VpcPeeringConnection
) {
    //let sourceRegion = peerDeployment.region;

    const vpcPeeringConnectionAccepter = new aws.ec2.VpcPeeringConnectionAccepter(
        `${deploymentName}-network-peering-${region}-to-${
            peerDeployment.region
        }`,
        {
            autoAccept: true,
            vpcPeeringConnectionId: peeringConnection.id
        },
        {
            provider: provider
        }
    );

    const peerRouteTable = new aws.ec2.RouteTable(
        `${deploymentName}-${region}-peered-subnet-routes`,
        {
            routes: [
                {
                    cidrBlock: peerDeployment.internalFacingSubnet.cidrBlock,
                    vpcPeeringConnectionId:
                        vpcPeeringConnectionAccepter.vpcPeeringConnectionId
                },
                {
                    cidrBlock: peerDeployment.externalFacingSubnet.cidrBlock,
                    vpcPeeringConnectionId:
                        vpcPeeringConnectionAccepter.vpcPeeringConnectionId
                }
                // {
                //     egressOnlyGatewayId: aws_egress_only_internet_gateway_foo.id,
                //     ipv6CidrBlock: "::/0",
                // },
            ],
            tags: {
                Name: `${deploymentName}-${region}-peered-subnet-routes`,
                Deployment: deploymentName
            },
            vpcId: vpc.id
        },
        {
            provider: provider
        }
    );

    const peerRouteTableAssociation = new aws.ec2.RouteTableAssociation(
        `${deploymentName}-${region}-peered-subnet-route-assoc`,
        {
            routeTableId: peerRouteTable.id,
            subnetId: vpc.id
        },
        {
            provider: provider
        }
    );

    return vpcPeeringConnectionAccepter;
}
