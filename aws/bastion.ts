import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export default function AWSBastion(
    deploymentName: string,
    provider: aws.Provider,
    vpc: aws.ec2.Vpc,
    region: aws.Region,
    subnet: aws.ec2.Subnet,
    size: aws.ec2.InstanceType,
    ami: pulumi.Output<string>,
    keyPair: aws.ec2.KeyPair
) {
    let ssh_ingress_security_group = new aws.ec2.SecurityGroup(
        `${deploymentName}-${region}-bastion-allow-ssh-ingress`,
        {
            description: "Allows SSH from external sources",
            egress: [
                {
                    cidrBlocks: ["0.0.0.0/0"],
                    fromPort: 0,
                    protocol: "-1",
                    toPort: 0
                },
                {
                    ipv6CidrBlocks: ["::/0"],
                    fromPort: 0,
                    protocol: "-1",
                    toPort: 0
                }
            ],
            ingress: [
                {
                    protocol: "tcp",
                    fromPort: 22,
                    toPort: 22,
                    cidrBlocks: ["0.0.0.0/0"]
                }
            ],
            tags: {
                Name: `${deploymentName}-${region}-bastion-allow-ssh-ingress`,
                Deployment: deploymentName,
                Group: "bastion"
            },
            vpcId: vpc.id
        },
        {
            provider: provider
        }
    );

    let bastion = new aws.ec2.Instance(
        `${deploymentName}-${region}-bastion`,
        {
            instanceType: size,
            securityGroups: [ssh_ingress_security_group.id],
            ami: ami,
            tags: {
                Name: `${deploymentName}-${region}-bastion`,
                Group: "bastion",
                Deployment: deploymentName
            },
            keyName: keyPair.keyName,
            rootBlockDevice: {
                deleteOnTermination: true
            },
            subnetId: subnet.id
        },
        {
            provider: provider
        }
    );

    const bastionExternalIP = new aws.ec2.Eip(
        `${deploymentName}-${region}-bastion-ip`,
        {
            instance: bastion.id,
            tags: {
                Name: `${deploymentName}-${region}-bastion-ip`,
                Group: "bastion",
                Deployment: deploymentName
            },
            vpc: true
        },
        {
            provider: provider
        }
    );

    return bastion;
}
