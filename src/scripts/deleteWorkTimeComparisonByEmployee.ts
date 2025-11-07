/*
 * Usage:
 *  npx tsx src/scripts/deleteWorkTimeComparisonByEmployee.ts <EMPLOYEE_ID> <MONTH>
 * Example:
 *  npx tsx src/scripts/deleteWorkTimeComparisonByEmployee.ts MSTlOQkXCgAPsb4y4f0p 2025-10
 */

import { collection, deleteDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deleteWorkTimeComparisonByEmployee(employeeId: string, month: string) {
  const batchSize = 300;
  let totalDeleted = 0;

  while (true) {
    const q = query(
      collection(db, 'workTimeComparisonResults'),
      where('employeeId', '==', employeeId),
      where('month', '==', month),
      limit(batchSize)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      break;
    }

    await Promise.all(snapshot.docs.map(doc => deleteDoc(doc.ref)));
    totalDeleted += snapshot.size;
    console.log(`Deleted batch: ${snapshot.size} docs (total: ${totalDeleted})`);

    // Firestore limits write throughput; short delay keeps us under throttling limits
    await sleep(250);
  }

  console.log(`Finished deleting workTimeComparisonResults for employee ${employeeId} / ${month}. Total deleted: ${totalDeleted}`);
}

async function main() {
  const [, , employeeId, month] = process.argv;

  if (!employeeId || !month) {
    console.error('Usage: npx tsx src/scripts/deleteWorkTimeComparisonByEmployee.ts <EMPLOYEE_ID> <MONTH>');
    process.exit(1);
  }

  await deleteWorkTimeComparisonByEmployee(employeeId, month);
  process.exit(0);
}

main().catch(error => {
  console.error('Unexpected error while deleting work time comparison data:', error);
  process.exit(1);
});
