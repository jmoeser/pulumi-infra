import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { readFileSync } from "fs";

declare var process: {
    env: {
        PULUMI_SSH_PUBKEY: string;
        USER: string;
    };
};

// export const deploymentName = "godzilla";

let keyName = process.env.USER;

let pubKey: string = readFileSync(process.env.PULUMI_SSH_PUBKEY).toString();

export const keyPair = new aws.ec2.KeyPair(keyName, { publicKey: pubKey });

// export const regions = ["us-east-1", "us-east-2"];

// export const vpcCidr = "10.0.0.0/16";

// export const externalFacingSubnets = ["10.0.1.0/24", "10.0.2.0/24"];

// export const internalOnlySubnets = ["172.1.0.0/24", "172.2.0.0/24"];
