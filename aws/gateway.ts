import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { keyPair } from "./config";

export default function AWSHttpGateway(
    deploymentName: string,
    provider: aws.Provider,
    vpc: aws.ec2.Vpc,
    region: aws.Region,
    subnet: aws.ec2.Subnet,
    size: aws.ec2.InstanceType,
    ami: pulumi.Output<string>,
    count: number,
    extraSecurityGroup?: Array<pulumi.Output<string>>
) {

    let http_ingress_security_group = new aws.ec2.SecurityGroup(
        `${deploymentName}-${region}-gateway-allow-http-ingress`,
        {
            description: "Allows HTTP/HTTPS from external sources",
            ingress: [
                {
                    protocol: "tcp",
                    fromPort: 80,
                    toPort: 80,
                    cidrBlocks: ["0.0.0.0/0"]
                },
                {
                    protocol: "tcp",
                    fromPort: 443,
                    toPort: 443,
                    cidrBlocks: ["0.0.0.0/0"]
                }
            ],
            tags: {
                Name: `${deploymentName}-${region}-gateway-allow-http-ingress`,
                Deployment: deploymentName,
                Group: "gateway"
            },
            vpcId: vpc.id
        },
        {
            provider: provider
        }
    );

    // if (extraSecurityGroup == undefined) {
    //     extraSecurityGroup = [];
    // }

    var index: number;
    var gateways: Array<aws.ec2.Instance> = [];

    for (index = 1; index <= count; index++) {
        const gateway = new aws.ec2.Instance(
            `${deploymentName}-${region}-http-gw-${index}`,
            {
                instanceType: size,
                securityGroups: [
                    http_ingress_security_group.id,
                    ...(extraSecurityGroup || [])
                ],
                ami: ami,
                tags: {
                    Name: `${deploymentName}-${region}-http-gw-${index}`,
                    Group: "gateway",
                    Deployment: deploymentName
                },
                keyName: keyPair.keyName,
                rootBlockDevice: {
                    deleteOnTermination: true
                },
                subnetId: subnet.id
            },
            {
                provider: provider,
                dependsOn: [provider]
            }
        );

        gateways.push(gateway);
    }

    return gateways;
}
