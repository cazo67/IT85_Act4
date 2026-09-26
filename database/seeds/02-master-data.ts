import "dotenv/config";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  collectionAreas,
  collectionRoutes,
  collectorAssignments,
  collectors,
  numberSequences,
  serviceAccounts,
  serviceEvents,
  servicePlans,
  serviceTypes,
  subscriberAddresses,
  subscriberContacts,
  subscribers
} from "../../source/apps/api/src/db/schema/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const db = drizzle(pool);

const planDefinitions = [
  ["NET-50", "INTERNET", "Internet 50 Mbps", 99900n, 50, null],
  ["NET-100", "INTERNET", "Internet 100 Mbps", 149900n, 100, null],
  ["NET-200", "INTERNET", "Internet 200 Mbps", 199900n, 200, null],
  ["CATV-80", "CABLE", "Cable 80 Channels", 59900n, null, 80],
  ["CATV-120", "CABLE", "Cable 120 Channels", 79900n, null, 120],
  ["COMBO-50", "COMBO", "Internet 50 + Cable", 139900n, 50, 80],
  ["COMBO-100", "COMBO", "Internet 100 + Cable", 189900n, 100, 120]
] as const;

try {
  await db.transaction(async (transaction) => {
    for (const [code, name] of [["INTERNET", "Internet"], ["CABLE", "Cable"], ["COMBO", "Combo"]] as const) {
      await transaction.insert(serviceTypes).values({ code, name }).onConflictDoUpdate({ target: serviceTypes.code, set: { name, isActive: true } });
    }
    const typeRows = await transaction.select().from(serviceTypes);

    for (const [code, typeCode, name, price, speed, channels] of planDefinitions) {
      const type = typeRows.find((row) => row.code === typeCode);
      if (!type) throw new Error(`Missing service type ${typeCode}`);
      await transaction.insert(servicePlans).values({ code, serviceTypeId: type.id, name, description: "Synthetic demonstration plan", priceCentavos: price, installationFeeCentavos: 50000n, reconnectionFeeCentavos: 25000n, internetSpeedMbps: speed, cableChannelCount: channels }).onConflictDoUpdate({ target: servicePlans.code, set: { name, priceCentavos: price, isActive: true, updatedAt: new Date() } });
    }

    for (let index = 1; index <= 3; index += 1) {
      const areaId = fixedUuid(100 + index);
      const routeId = fixedUuid(200 + index);
      await transaction.insert(collectionAreas).values({ id: areaId, code: `AREA-${index}`, name: `Demonstration Area ${index}`, description: "Synthetic collection area" }).onConflictDoNothing({ target: collectionAreas.id });
      await transaction.insert(collectionRoutes).values({ id: routeId, areaId, code: `ROUTE-${index}`, name: `Demonstration Route ${index}`, scheduleNotes: `Route schedule ${index}` }).onConflictDoNothing({ target: collectionRoutes.id });
    }

    for (let index = 1; index <= 2; index += 1) {
      await transaction.insert(collectors).values({ id: fixedUuid(300 + index), code: `COL-${index}`, displayName: `Demo Collector ${index}`, contactNumber: `0917000000${index}` }).onConflictDoNothing({ target: collectors.id });
    }

    const plans = await transaction.select().from(servicePlans).where(eq(servicePlans.isActive, true));
    for (let index = 1; index <= 50; index += 1) {
      const subscriberId = fixedUuid(1_000 + index);
      const addressId = fixedUuid(2_000 + index);
      const areaId = fixedUuid(100 + ((index - 1) % 3) + 1);
      const collectorId = fixedUuid(300 + ((index - 1) % 2) + 1);
      const routeId = fixedUuid(200 + ((index - 1) % 3) + 1);
      await transaction.insert(subscribers).values({ id: subscriberId, accountNumber: `SUB-DEMO-${String(index).padStart(4, "0")}`, firstName: `Demo${index}`, lastName: "Subscriber", normalizedName: `demo${index} subscriber`, billingDay: ((index - 1) % 28) + 1, dueDay: ((index + 9) % 28) + 1, collectionAreaId: areaId, assignedCollectorId: collectorId, notes: "Synthetic laboratory record" }).onConflictDoNothing({ target: subscribers.id });
      await transaction.insert(subscriberAddresses).values({ id: addressId, subscriberId, type: "SERVICE", label: "Primary service address", line1: `${index} Demo Street`, barangay: `Barangay ${((index - 1) % 5) + 1}`, cityMunicipality: "Demonstration City", province: "Bukidnon", postalCode: "8700", normalizedSearch: `${index} demo street barangay demonstration city bukidnon 8700`, isPrimary: true }).onConflictDoNothing({ target: subscriberAddresses.id });
      await transaction.insert(subscriberContacts).values({ id: fixedUuid(3_000 + index), subscriberId, type: "MOBILE", value: `0918${String(index).padStart(7, "0")}`, normalizedValue: `0918${String(index).padStart(7, "0")}`, isPrimary: true }).onConflictDoNothing({ target: subscriberContacts.id });

      const serviceCount = index <= 10 ? 2 : 1;
      for (let serviceIndex = 0; serviceIndex < serviceCount; serviceIndex += 1) {
        const ordinal = index + (serviceIndex * 50);
        const plan = plans[(ordinal - 1) % plans.length];
        if (!plan) throw new Error("No active plans are available.");
        const serviceId = fixedUuid(4_000 + ordinal);
        await transaction.insert(serviceAccounts).values({ id: serviceId, serviceAccountNumber: `SVC-DEMO-${String(ordinal).padStart(4, "0")}`, subscriberId, planId: plan.id, installationAddressId: addressId, assignedCollectorId: collectorId, activationDate: "2026-01-01", billingStartDate: "2026-01-01", billingDay: ((index - 1) % 28) + 1, dueDay: ((index + 9) % 28) + 1, currentRateCentavos: plan.priceCentavos, status: "ACTIVE" }).onConflictDoNothing({ target: serviceAccounts.id });
        await transaction.insert(serviceEvents).values({ id: fixedUuid(5_000 + ordinal), serviceAccountId: serviceId, type: "ACTIVATED", description: `Synthetic activation on ${plan.code}.`, newStatus: "ACTIVE" }).onConflictDoNothing({ target: serviceEvents.id });
        await transaction.insert(collectorAssignments).values({ id: fixedUuid(6_000 + ordinal), collectorId, routeId, serviceAccountId: serviceId, effectiveFrom: "2026-01-01" }).onConflictDoNothing();
      }
    }

    await transaction.insert(numberSequences).values([{ code: "SUBSCRIBER", lastValue: 50n }, { code: "SERVICE_ACCOUNT", lastValue: 60n }]).onConflictDoUpdate({ target: numberSequences.code, set: { lastValue: sql`greatest(${numberSequences.lastValue}, excluded.last_value)`, updatedAt: new Date() } });
  });
} finally {
  await pool.end();
}

console.info("BCIS synthetic plans, collection setup, 50 subscribers, and 60 service accounts are ready.");

function fixedUuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
