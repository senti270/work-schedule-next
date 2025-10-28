import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

// 환경변수 기반 초기화 필요 (프로젝트에서 사용하는 설정으로 교체)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log('workTimeComparisonResults branchName 백필 시작');
  const branchesSnap = await getDocs(collection(db, 'branches'));
  const branchesMap = new Map<string, string>();
  branchesSnap.forEach((d) => {
    const data = d.data() as { name?: string };
    branchesMap.set(d.id, data?.name || '');
  });

  const wtrSnap = await getDocs(collection(db, 'workTimeComparisonResults'));
  let updated = 0;
  for (const d of wtrSnap.docs) {
    const data = d.data() as { branchName?: string; branchId?: string };
    if (!data.branchName && data.branchId) {
      const name = branchesMap.get(data.branchId) || '';
      await updateDoc(doc(db, 'workTimeComparisonResults', d.id), { branchName: name });
      updated++;
    }
  }
  console.log(`branchName 업데이트 완료: ${updated}건`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});



