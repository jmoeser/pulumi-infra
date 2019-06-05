import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { readFileSync } from "fs";

declare var process: {
    env: {
        PULUMI_SSH_PUBKEY: string;
        USER: string;
    };
};

let keyName = process.env.USER;

let pubKey: string = readFileSync(process.env.PULUMI_SSH_PUBKEY).toString();

export const keyPair = new aws.ec2.KeyPair(keyName, { publicKey: pubKey });
