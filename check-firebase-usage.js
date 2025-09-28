const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBvOzrkgLq8Xj4QZqQZqQZqQZqQZqQZqQZq",
  authDomain: "workschedule-8fc6f.firebaseapp.com",
  projectId: "workschedule-8fc6f",
  storageBucket: "workschedule-8fc6f.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkFirebaseUsage() {
  try {
    console.log('=== Firebase 데이터 사용량 분석 ===');
    
    // 각 컬렉션별 문서 수 확인
    const collections = [
      'schedules',
      'employees', 
      'branches',
      'actualWorkRecords',
      'employeeReviewStatus',
      'payrollLocks',
      'weeklyNotes',
      'employmentContracts'
    ];
    
    let totalDocs = 0;
    
    for (const collectionName of collections) {
      try {
        const snapshot = await getDocs(collection(db, collectionName));
        const count = snapshot.docs.length;
        totalDocs += count;
        console.log(`${collectionName}: ${count}개 문서`);
      } catch (error) {
        console.log(`${collectionName}: 접근 불가 또는 오류`);
      }
    }
    
    console.log(`\n총 문서 수: ${totalDocs}개`);
    
    // 읽기 횟수 추정
    const estimatedReads = totalDocs * 10; // 각 문서당 평균 10번 읽기
    console.log(`추정 읽기 횟수: ${estimatedReads.toLocaleString()}회`);
    
    if (estimatedReads > 50000) {
      console.log('\n⚠️  Firebase 무료 플랜 한도 초과!');
      console.log('해결 방법:');
      console.log('1. Blaze 플랜으로 업그레이드 (월 $25 크레딧)');
      console.log('2. 데이터 최적화 및 캐싱 도입');
      console.log('3. 불필요한 데이터 정리');
    }
    
  } catch (error) {
    console.error('분석 중 오류:', error);
  }
}

checkFirebaseUsage();
