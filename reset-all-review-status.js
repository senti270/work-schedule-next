const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where, deleteDoc, doc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJ",
  authDomain: "work-schedule-next.firebaseapp.com",
  projectId: "work-schedule-next",
  storageBucket: "work-schedule-next.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdefghijklmnop"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function resetAllReviewStatus() {
  try {
    console.log('2024-09월의 모든 검토 상태 데이터 확인 중...');
    
    // 2024-09월의 모든 검토 상태 데이터 조회
    const reviewStatusQuery = query(
      collection(db, 'employeeReviewStatus'),
      where('month', '==', '2024-09')
    );
    const reviewStatusSnapshot = await getDocs(reviewStatusQuery);
    
    console.log('2024-09월 검토 상태 데이터 개수:', reviewStatusSnapshot.docs.length);
    
    // 각 직원의 상태 확인
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employeeMap = new Map();
    employeesSnapshot.docs.forEach(doc => {
      employeeMap.set(doc.id, doc.data().name);
    });
    
    console.log('\n=== 2024-09월 검토 상태 현황 ===');
    for (const docSnapshot of reviewStatusSnapshot.docs) {
      const data = docSnapshot.data();
      const employeeName = employeeMap.get(data.employeeId) || '알 수 없음';
      console.log(`${employeeName} (${data.employeeId}): ${data.status}`);
    }
    
    // 실제근무 데이터가 없는 직원들의 잘못된 상태 삭제
    console.log('\n=== 잘못된 상태 데이터 정리 중 ===');
    let deletedCount = 0;
    
    for (const docSnapshot of reviewStatusSnapshot.docs) {
      const data = docSnapshot.data();
      
      // 해당 직원의 실제근무 데이터 확인
      const actualWorkQuery = query(
        collection(db, 'actualWorkRecords'),
        where('employeeId', '==', data.employeeId),
        where('month', '==', '2024-09')
      );
      const actualWorkSnapshot = await getDocs(actualWorkQuery);
      
      const employeeName = employeeMap.get(data.employeeId) || '알 수 없음';
      
      if (actualWorkSnapshot.empty) {
        // 실제근무 데이터가 없는데 검토완료 상태인 경우 삭제
        if (data.status === '검토완료' || data.status === '근무시간검토완료') {
          console.log(`삭제: ${employeeName} - 실제근무 데이터 없음`);
          await deleteDoc(doc(db, 'employeeReviewStatus', docSnapshot.id));
          deletedCount++;
        }
      } else {
        console.log(`유지: ${employeeName} - 실제근무 데이터 있음`);
      }
    }
    
    console.log(`\n총 ${deletedCount}개의 잘못된 상태 데이터가 삭제되었습니다.`);
    console.log('상태 정리 완료!');
    
  } catch (error) {
    console.error('에러 발생:', error);
  }
}

resetAllReviewStatus();
