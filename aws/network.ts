import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import AWSRegionalDeployment from "./deployment";

export function subdivideIpv6Subnet(
    inputSubnet: pulumi.Output<string>,
    step: number
) {
    return pulumi
        .all([inputSubnet, step])
        .apply(
            ([inputSubnet, step]) => `${inputSubnet.slice(0, -6)}${step}::/64`
        );
}

export function regionalVpc(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    vpcCidr: string,
    ipv6Enabled: boolean = false
) {
    const vpc = new aws.ec2.Vpc(
        `${deploymentName}-${region}-vpc`,
        {
            cidrBlock: vpcCidr,
            assignGeneratedIpv6CidrBlock: ipv6Enabled,
            enableDnsHostnames: false,
            tags: {
                Name: `${deploymentName}-${region}-vpc`,
                Deployment: deploymentName
            }
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
    vpc: aws.ec2.Vpc,
    ipv6Cidr?: pulumi.Output<string>
) {
    return new aws.ec2.Subnet(
        `${deploymentName}-${region}-external-subnet`,
        {
            cidrBlock: subnet,
            availabilityZone: availabilityZone,
            ipv6CidrBlock: ipv6Cidr || undefined,
            assignIpv6AddressOnCreation: (ipv6Cidr) ? true : false,
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
    vpc: aws.ec2.Vpc,
    ipv6Cidr?: pulumi.Output<string>
) {
    return new aws.ec2.Subnet(
        `${deploymentName}-${region}-internal-subnet`,
        {
            cidrBlock: subnet,
            availabilityZone: availabilityZone,
            ipv6CidrBlock: ipv6Cidr || undefined,
            assignIpv6AddressOnCreation: (ipv6Cidr) ? true : false,
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
}

export function createNATGateway(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    subnet: aws.ec2.Subnet
) {
    const natEip = new aws.ec2.Eip(
        `${deploymentName}-${region}-nat-gateway-ip`,
        {
            vpc: true
        },
        {
            provider: provider
        }
    );

    const natGateway = new aws.ec2.NatGateway(
        `${deploymentName}-${region}-nat-gateway`,
        {
            allocationId: natEip.id,
            subnetId: subnet.id,
            tags: {
                Name: `${deploymentName}-${region}-nat-gateway`,
                Deployment: deploymentName
            }
        },
        {
            provider: provider
        }
    );

    return natGateway;
}

export function createInternetGateway(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    vpc: aws.ec2.Vpc
) {
    // const defaultInternetGateway = pulumi.output(aws.ec2.getInternetGateway({
    //     filters: [{
    //         name: "attachment.vpc-id",
    //         values: [`${vpc.id}`],
    //     }],
    // })).id;

    // return defaultInternetGateway

    return new aws.ec2.InternetGateway(
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
}

export function createRouteTable(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    subnet: aws.ec2.Subnet,
    vpc: aws.ec2.Vpc,
    gateway: aws.ec2.NatGateway | aws.ec2.InternetGateway,
    description: string,
    ipv6Enabled: boolean,
    ipv6EgressGateway?: aws.ec2.EgressOnlyInternetGateway
) {
    const routeTable = new aws.ec2.RouteTable(
        `${deploymentName}-${region}-${description}-subnet-routes`,
        {
            routes: [
                {
                    cidrBlock: "0.0.0.0/0",
                    gatewayId: gateway.id
                }
            ],
            tags: {
                Name: `${deploymentName}-${region}-${description}-subnet-routes`,
                Deployment: deploymentName
            },
            vpcId: vpc.id
        },
        {
            provider: provider,
            dependsOn: [gateway]
        }
    );

    if (ipv6EgressGateway) {
        const defaultIpv6RouteViaEgressGateway = new aws.ec2.Route(
            `${deploymentName}-${region}-${description}-default-ipv6-route-via-egress-gateway`,
            {
                destinationIpv6CidrBlock: "::/0",
                routeTableId: routeTable.id,
                egressOnlyGatewayId: ipv6EgressGateway.id
            },
            {
                provider: provider
            }
        );
    } else if (ipv6Enabled) {
        const defaultIpv6RouteViaInternetGateway = new aws.ec2.Route(
            `${deploymentName}-${region}-${description}-default-ipv6-route-via-internet-gateway`,
            {
                destinationIpv6CidrBlock: "::/0",
                routeTableId: routeTable.id,
                gatewayId: gateway.id
            },
            {
                provider: provider
            }
        );
    }

    const routeTableAssociation = new aws.ec2.RouteTableAssociation(
        `${deploymentName}-${region}-${description}-subnet-route-assoc`,
        {
            routeTableId: routeTable.id,
            subnetId: subnet.id
        },
        {
            provider: provider
        }
    );

    return routeTable;
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
            tags: {
                Name: `${deploymentName}-network-peering-${regionA}-to-${regionB}`,
                Deployment: deploymentName
            }
        },
        {
            provider: provider
        }
    );
}

export function acceptVpcPeeringRequest(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    vpc: aws.ec2.Vpc,
    internalFacingSubnet: aws.ec2.Subnet,
    externalFacingSubnet: aws.ec2.Subnet,
    internalRouteTable: aws.ec2.RouteTable,
    externalRouteTable: aws.ec2.RouteTable,
    peerDeployment: AWSRegionalDeployment,
    peeringConnection: aws.ec2.VpcPeeringConnection
) {
    const vpcPeeringConnectionAccepter = new aws.ec2.VpcPeeringConnectionAccepter(
        `${deploymentName}-network-peering-${region}-to-${peerDeployment.region}`,
        {
            autoAccept: true,
            vpcPeeringConnectionId: peeringConnection.id
        },
        {
            provider: provider
        }
    );

    // change this to a loop?

    const internalSubnetRoutePeerInternalSubnet = new aws.ec2.Route(
        `${deploymentName}-${region}-int-sub-to-peer-int-sub`,
        {
            destinationCidrBlock: peerDeployment.internalFacingSubnet.cidrBlock,
            routeTableId: internalRouteTable.id,
            vpcPeeringConnectionId:
                vpcPeeringConnectionAccepter.vpcPeeringConnectionId
        },
        {
            provider: provider
        }
    );

    const internalSubnetRoutePeerExternalSubnet = new aws.ec2.Route(
        `${deploymentName}-${region}-int-sub-to-peer-ext-sub`,
        {
            destinationCidrBlock: peerDeployment.externalFacingSubnet.cidrBlock,
            routeTableId: internalRouteTable.id,
            vpcPeeringConnectionId:
                vpcPeeringConnectionAccepter.vpcPeeringConnectionId
        },
        {
            provider: provider
        }
    );

    const externalSubnetRoutePeerInternalSubnet = new aws.ec2.Route(
        `${deploymentName}-${region}-ext-sub-to-peer-int-sub`,
        {
            destinationCidrBlock: peerDeployment.internalFacingSubnet.cidrBlock,
            routeTableId: externalRouteTable.id,
            vpcPeeringConnectionId:
                vpcPeeringConnectionAccepter.vpcPeeringConnectionId
        },
        {
            provider: provider
        }
    );

    const externalSubnetRoutePeerExternalSubnet = new aws.ec2.Route(
        `${deploymentName}-${region}-ext-sub-to-peer-ext-sub`,
        {
            destinationCidrBlock: peerDeployment.externalFacingSubnet.cidrBlock,
            routeTableId: externalRouteTable.id,
            vpcPeeringConnectionId:
                vpcPeeringConnectionAccepter.vpcPeeringConnectionId
        },
        {
            provider: provider
        }
    );

    // IPv6 over inter-region VPC peering connections is not supported
    // https://docs.aws.amazon.com/vpc/latest/peering/invalid-peering-configurations.html
    // if (peerDeployment.ipv6Enabled) {

    //     const externalSubnetRoutePeerIpv6Subnet = new aws.ec2.Route(
    //         `${deploymentName}-${region}-ext-sub-to-peer-ipv6-sub`,
    //         {
    //             destinationIpv6CidrBlock: peerDeployment.vpcIpv6Cidr,
    //             routeTableId: externalRouteTable.id,
    //             vpcPeeringConnectionId:
    //                 vpcPeeringConnectionAccepter.vpcPeeringConnectionId
    //         },
    //         {
    //             provider: provider
    //         }
    //     );

    //     const internalSubnetRoutePeerIpv6Subnet = new aws.ec2.Route(
    //         `${deploymentName}-${region}-int-sub-to-peer-ipv6-sub`,
    //         {
    //             destinationIpv6CidrBlock: peerDeployment.vpcIpv6Cidr,
    //             routeTableId: internalRouteTable.id,
    //             vpcPeeringConnectionId:
    //                 vpcPeeringConnectionAccepter.vpcPeeringConnectionId
    //         },
    //         {
    //             provider: provider
    //         }
    //     );
    // }

    const peerInternalSubnetRouteInternalSubnet = new aws.ec2.Route(
        `${deploymentName}-${peerDeployment.region}-int-sub-to-peer-int-sub`,
        {
            destinationCidrBlock: internalFacingSubnet.cidrBlock,
            routeTableId: peerDeployment.internalRouteTable.id,
            vpcPeeringConnectionId:
                vpcPeeringConnectionAccepter.vpcPeeringConnectionId
        },
        {
            provider: peerDeployment.provider
        }
    );

    const peerInternalSubnetRouteExternalSubnet = new aws.ec2.Route(
        `${deploymentName}-${peerDeployment.region}-int-sub-to-peer-ext-sub`,
        {
            destinationCidrBlock: externalFacingSubnet.cidrBlock,
            routeTableId: peerDeployment.internalRouteTable.id,
            vpcPeeringConnectionId:
                vpcPeeringConnectionAccepter.vpcPeeringConnectionId
        },
        {
            provider: peerDeployment.provider
        }
    );

    const peerExternalSubnetRouteInternalSubnet = new aws.ec2.Route(
        `${deploymentName}-${peerDeployment.region}-ext-sub-to-peer-int-sub`,
        {
            destinationCidrBlock: internalFacingSubnet.cidrBlock,
            routeTableId: peerDeployment.externalRouteTable.id,
            vpcPeeringConnectionId:
                vpcPeeringConnectionAccepter.vpcPeeringConnectionId
        },
        {
            provider: peerDeployment.provider
        }
    );

    const peerExternalSubnetRouteExternalSubnet = new aws.ec2.Route(
        `${deploymentName}-${peerDeployment.region}-ext-sub-to-peer-ext-sub`,
        {
            destinationCidrBlock: externalFacingSubnet.cidrBlock,
            routeTableId: peerDeployment.externalRouteTable.id,
            vpcPeeringConnectionId:
                vpcPeeringConnectionAccepter.vpcPeeringConnectionId
        },
        {
            provider: peerDeployment.provider
        }
    );


    // if (vpc.ipv6CidrBlock) {

    //     const peerRxternalSubnetRouteIpv6Subnet = new aws.ec2.Route(
    //         `${deploymentName}-${peerDeployment.region}-ext-sub-to-peer-ipv6-sub`,
    //         {
    //             destinationIpv6CidrBlock: vpc.ipv6CidrBlock,
    //             routeTableId: peerDeployment.externalRouteTable.id,
    //             vpcPeeringConnectionId:
    //                 vpcPeeringConnectionAccepter.vpcPeeringConnectionId
    //         },
    //         {
    //             provider: peerDeployment.provider
    //         }
    //     );

    //     const peerInternalSubnetRouteIpv6Subnet = new aws.ec2.Route(
    //         `${deploymentName}-${peerDeployment.region}-int-sub-to-peer-ipv6-sub`,
    //         {
    //             destinationIpv6CidrBlock: vpc.ipv6CidrBlock,
    //             routeTableId: peerDeployment.internalRouteTable.id,
    //             vpcPeeringConnectionId:
    //                 vpcPeeringConnectionAccepter.vpcPeeringConnectionId
    //         },
    //         {
    //             provider: peerDeployment.provider
    //         }
    //     );
    // }

    return vpcPeeringConnectionAccepter;
}

export function createIpv6EgressGateway(
    deploymentName: string,
    provider: aws.Provider,
    region: aws.Region,
    vpc: aws.ec2.Vpc
) {
    return new aws.ec2.EgressOnlyInternetGateway(
        `${deploymentName}-${region}-ipv6-egress-gateway`,
        {
            vpcId: vpc.id
        },
        {
            provider: provider
        }
    );
}
