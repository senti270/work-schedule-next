import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBvOzQqJgQZJgQZJgQZJgQZJgQZJgQZJgQ",
  authDomain: "work-schedule-next.firebaseapp.com",
  projectId: "work-schedule-next",
  storageBucket: "work-schedule-next.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456789"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// employeeName을 중복 저장하는 컬렉션 목록
const COLLECTIONS_WITH_EMPLOYEE_NAME = [
  'schedules',
  'workTimeComparisonResults', 
  'actualWorkRecords',
  'employeeMemos',
  'overtimeRecords'
];

async function updateEmployeeNameInAllCollections(oldName: string, newName: string) {
  try {
    console.log(`🔥 직원명 변경 시작: "${oldName}" → "${newName}"`);
    
    let totalUpdated = 0;
    
    for (const collectionName of COLLECTIONS_WITH_EMPLOYEE_NAME) {
      console.log(`\n📁 ${collectionName} 컬렉션 처리 중...`);
      
      const q = query(
        collection(db, collectionName),
        where('employeeName', '==', oldName)
      );
      
      const snapshot = await getDocs(q);
      const docs = snapshot.docs;
      
      if (docs.length === 0) {
        console.log(`  ✅ ${collectionName}: 변경할 문서 없음`);
        continue;
      }
      
      console.log(`  📝 ${collectionName}: ${docs.length}개 문서 발견`);
      
      // 배치 업데이트 (최대 500개씩)
      const batch = writeBatch(db);
      let batchCount = 0;
      
      for (const docSnapshot of docs) {
        batch.update(docSnapshot.ref, { employeeName: newName });
        batchCount++;
        
        // Firestore 배치 제한 (500개)에 도달하면 커밋
        if (batchCount >= 500) {
          await batch.commit();
          console.log(`    ✅ ${batchCount}개 문서 업데이트 완료`);
          batchCount = 0;
        }
      }
      
      // 남은 문서들 커밋
      if (batchCount > 0) {
        await batch.commit();
        console.log(`    ✅ ${batchCount}개 문서 업데이트 완료`);
      }
      
      totalUpdated += docs.length;
    }
    
    console.log(`\n🎉 직원명 변경 완료!`);
    console.log(`총 ${totalUpdated}개 문서가 업데이트되었습니다.`);
    
  } catch (error) {
    console.error('직원명 변경 중 오류:', error);
  }
}

// 사용 예시
async function main() {
  // 유진을 유친으로 변경
  await updateEmployeeNameInAllCollections('유진', '유친');
  
  // 다른 이름 변경 예시
  // await updateEmployeeNameInAllCollections('기존이름', '새이름');
}

main();
