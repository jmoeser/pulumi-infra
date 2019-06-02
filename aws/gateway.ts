import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { keyPair } from "./config";

export default function AWSHttpGateway(
    deploymentName: string,
    provider: aws.Provider,
    vpc: aws.ec2.Vpc,
    region: aws.Region,
    SecGroups: Array<pulumi.Output<string>>,
    //httpIngressSecGroup: aws.ec2.SecurityGroup,
    subnet: aws.ec2.Subnet,
    size: aws.ec2.InstanceType,
    ami: pulumi.Output<string>,
    count: number
) {
    // const currentRegion = pulumi.output(aws.getRegion({}));
    // console.log(currentRegion);
    // // To get the value of an Output<T> as an Output<string> consider either:
    // // 1: o.apply(v => `prefix${v}suffix`)

    // //let region = currentRegion.apply(v => `a${v}a`)
    // const region: pulumi.Output<string> = pulumi.interpolate `${deploymentName}-${currentRegion}`;
    // console.log(region);

    var index: number;
    var gateways: Array<aws.ec2.Instance> = [];

    for (index = 1; index <= count; index++) {
        const gateway = new aws.ec2.Instance(
            `${deploymentName}-${region}-http-gw-${index}`,
            {
                instanceType: size,
                securityGroups: SecGroups,
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
