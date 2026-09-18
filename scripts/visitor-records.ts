import { db } from "../src/lib/db.ts";
import { deleteVisitorRecords, lookupVisitorRecords, visitorHashForIp } from "../src/lib/visitorRecords.ts";

// Run it yourself, for a visitor who asked (see the privacy page). The IP is turned into the same hash the site stored:
//   npm run visitor:records -- 203.0.113.5              show how many records that visitor has
//   npm run visitor:records -- 203.0.113.5 --delete     delete them

const USAGE = "Usage: npm run visitor:records -- <ip address> [--delete]";

async function main() {
  const [ip, flag] = process.argv.slice(2);
  if (!ip || (flag && flag !== "--delete")) {
    console.error(USAGE);
    process.exit(1);
  }

  const hash = visitorHashForIp(ip);
  if (!hash) {
    console.error("That is not an IP address, or VISITOR_HASH_SECRET is missing or too short.");
    process.exit(1);
  }

  const sql = db();
  if (flag === "--delete") {
    console.log(`Deleted ${await deleteVisitorRecords(sql, hash)} record(s).`);
    return;
  }

  const records = await lookupVisitorRecords(sql, hash);
  if (records.views === 0) {
    console.log("No records for that address.");
    return;
  }
  console.log(`${records.views} record(s), first ${new Date(records.firstSeen!).toISOString()}, last ${new Date(records.lastSeen!).toISOString()}, countries: ${records.countries.join(", ") || "none"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
