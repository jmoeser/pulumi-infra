import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export function createFromBastionIngressRule(
    deploymentName: string,
    provider: aws.Provider,
    vpc: aws.ec2.Vpc,
    region: aws.Region,
    bastion: aws.ec2.Instance
) {
    let bastionInternalIp = bastion.privateIp.apply(
        privateIp => `${privateIp}/32`
    );
    return new aws.ec2.SecurityGroup(
        `${deploymentName}-${region}-allow-ssh-from-bastion`,
        {
            description: `Rule allowing SSH from bastion internal IP`,
            ingress: [
                {
                    protocol: "tcp",
                    fromPort: 22,
                    toPort: 22,
                    cidrBlocks: [bastionInternalIp]
                }
            ],
            tags: {
                Name: `${deploymentName}-${region}-allow-ssh-from-bastion`,
                Deployment: deploymentName,
                Group: "bastion"
            },
            vpcId: vpc.id
        },
        {
            provider: provider,
            dependsOn: [bastion]
        }
    );
}
