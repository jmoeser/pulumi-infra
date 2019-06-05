import AWSRegionalDeployment from "./deployment";

let mainRegion = new AWSRegionalDeployment(
    "godzilla",
    "us-east-1",
    "172.16.0.0/16",
    "172.16.1.0/24",
    "172.16.2.0/24"
);

let secondaryRegion = new AWSRegionalDeployment(
    "godzilla",
    "us-east-2",
    "172.17.0.0/16",
    "172.17.1.0/24",
    "172.17.2.0/24"
);

let bastionHost = mainRegion.deployBastion();
let peeringRequest = mainRegion.peerWith(
    secondaryRegion.vpc,
    secondaryRegion.region
);
secondaryRegion.acceptPeerRequest(peeringRequest, mainRegion);
secondaryRegion.setBastion(bastionHost);
mainRegion.deployGateway();
secondaryRegion.deployGateway();

// for generating the diagrams?
// https://mermaidjs.github.io/
// https://28mm.github.io/blast-radius-docs/
