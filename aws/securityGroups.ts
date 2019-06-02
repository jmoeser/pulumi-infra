import * as aws from "@pulumi/aws";

export default class AWSBaseSecurityGroups {
    public http_ingress_security_group: aws.ec2.SecurityGroup;
    public ssh_ingress_security_group: aws.ec2.SecurityGroup;
    public allow_ssh_from_bastion_ingress_security_group: aws.ec2.SecurityGroup;

    constructor(
        deploymentName: string,
        provider: aws.Provider,
        region: aws.Region
    ) {
        this.http_ingress_security_group = new aws.ec2.SecurityGroup(
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
                    Deployment: deploymentName,
                    Group: "gateway"
                }
            },
            {
                provider: provider
            }
        );

        this.ssh_ingress_security_group = new aws.ec2.SecurityGroup(
            `${deploymentName}-${region}-bastion-allow-ssh-ingress`,
            {
                description: "Allows SSH from external sources",
                ingress: [
                    {
                        protocol: "tcp",
                        fromPort: 22,
                        toPort: 22,
                        cidrBlocks: ["0.0.0.0/0"]
                    }
                ],
                tags: {
                    Deployment: deploymentName,
                    Group: "bastion"
                }
            },
            {
                provider: provider
            }
        );

        // this won't work for peered VPCs...
        this.allow_ssh_from_bastion_ingress_security_group = new aws.ec2.SecurityGroup(
            `${deploymentName}-${region}-allow-ssh-from-bastion`,
            {
                description: "Allow SSH from our bastion security group",
                ingress: [
                    {
                        protocol: "tcp",
                        fromPort: 22,
                        toPort: 22,
                        // Error authorizing security group ingress rules: InvalidGroupId.Malformed: Invalid id: (expecting "sg-..."
                        //securityGroups: [this.ssh_ingress_security_group.groupId]
                        cidrBlocks: ["0.0.0.0/0"]
                    }
                ],
                tags: {
                    Deployment: deploymentName,
                    Group: "bastion"
                }
            },
            {
                provider: provider,
                dependsOn: [this.ssh_ingress_security_group]
            }
        );
    }
}
