import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export function findLatestCentOS7(provider: aws.Provider) {
    return pulumi.output(
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
            { provider: provider }
        )
    ).id;
}

export function findLatestUbuntu1804(provider: aws.Provider) {
    return pulumi.output(
        aws.getAmi(
            {
                filters: [
                    {
                        name: "name",
                        values: [
                            "ubuntu/images/hvm-ssd/ubuntu-bionic-18.04-amd64-server*"
                        ]
                    },
                    {
                        name: "virtualization-type",
                        values: ["hvm"]
                    }
                ],
                mostRecent: true,
                owners: ["099720109477"] // Canonical
            },
            { provider: provider }
        )
    ).id;
}
