const campaignsFlagIndex = process.argv.indexOf("--campaigns");
const campaigns = campaignsFlagIndex === -1 ? 0 : Number(process.argv[campaignsFlagIndex + 1]);

console.log(`sim: skeleton pass — bot policies and metric collection land in M1-12 (Spec §21.4). Requested ${campaigns} campaigns, ran 0.`);
process.exit(0);
