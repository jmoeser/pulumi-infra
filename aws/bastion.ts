import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { keyPair } from "./config";

export default function AWSBastion(
    deploymentName: string,
    provider: aws.Provider,
    vpc: aws.ec2.Vpc,
    region: aws.Region,
    sshIngressSecGroup: aws.ec2.SecurityGroup,
    subnet: aws.ec2.Subnet,
    size: aws.ec2.InstanceType,
    ami: pulumi.Output<string>
) {
    return new aws.ec2.Instance(`${deploymentName}-${region}-bastion`, {
        instanceType: size,
        securityGroups: [sshIngressSecGroup.name],
        ami: ami,
        tags: {
            Name: `${deploymentName}-${region}-bastion`,
            Group: "bastion",
            Deployment: deploymentName
        },
        keyName: keyPair.keyName,
        rootBlockDevice: {
            deleteOnTermination: true
        }
    });
}
