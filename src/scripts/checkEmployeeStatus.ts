import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyCahLcE9AibVxzwYX8xqDr_SzTP3-vhtjo",
  authDomain: "workschedule-8fc6f.firebaseapp.com",
  projectId: "workschedule-8fc6f",
  storageBucket: "workschedule-8fc6f.firebasestorage.app",
  messagingSenderId: "860832451",
  appId: "1:860832451:web:21754e4c80bcc6f752d6fe",
  measurementId: "G-FE573RCHWZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkEmployeeStatus() {
  try {
    console.log('🔥 끄엉 직원 상태 확인 시작...');
    
    // 1. 끄엉 직원 찾기
    const employeesQuery = query(collection(db, 'employees'), where('name', '==', '끄엉'));
    const employeesSnapshot = await getDocs(employeesQuery);
    
    if (employeesSnapshot.empty) {
      console.log('❌ 끄엉 직원을 찾을 수 없습니다.');
      return;
    }
    
    const employee = employeesSnapshot.docs[0];
    const employeeId = employee.id;
    const employeeName = employee.data().name;
    
    console.log(`\n🔥 직원 정보: ${employeeName} (${employeeId})`);
    
    // 2. 급여확정 상태 확인
    const confirmedQuery = query(
      collection(db, 'confirmedPayrolls'),
      where('employeeId', '==', employeeId),
      where('month', '==', '2025-09')
    );
    const confirmedSnapshot = await getDocs(confirmedQuery);
    
    console.log(`\n💰 급여확정 상태: ${confirmedSnapshot.empty ? '미확정' : '확정됨'}`);
    if (!confirmedSnapshot.empty) {
      const payrollData = confirmedSnapshot.docs[0].data();
      console.log(`   - 확정일: ${payrollData.confirmedAt?.toDate?.() || payrollData.confirmedAt}`);
      console.log(`   - 확정자: ${payrollData.confirmedBy}`);
    }
    
    // 3. 검토상태 확인 (모든 지점)
    const reviewQuery = query(
      collection(db, 'employeeReviewStatus'),
      where('employeeId', '==', employeeId),
      where('month', '==', '2025-09')
    );
    const reviewSnapshot = await getDocs(reviewQuery);
    
    console.log(`\n📋 검토상태 (${reviewSnapshot.docs.length}개 지점):`);
    reviewSnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`   - 지점 ${data.branchId} (${data.branchName}): ${data.status}`);
      console.log(`     업데이트: ${data.updatedAt?.toDate?.() || data.updatedAt}`);
    });
    
    // 4. 근무시간비교 결과 확인
    const comparisonQuery = query(
      collection(db, 'workTimeComparisonResults'),
      where('employeeId', '==', employeeId),
      where('month', '==', '2025-09')
    );
    const comparisonSnapshot = await getDocs(comparisonQuery);
    
    console.log(`\n⏰ 근무시간비교 결과: ${comparisonSnapshot.docs.length}건`);
    if (comparisonSnapshot.docs.length > 0) {
      const firstResult = comparisonSnapshot.docs[0].data();
      console.log(`   - 상태: ${firstResult.status || '상태 없음'}`);
      console.log(`   - 생성일: ${firstResult.createdAt?.toDate?.() || firstResult.createdAt}`);
    }
    
    // 5. 문제 진단
    console.log('\n🔍 문제 진단:');
    
    const hasConfirmedPayroll = !confirmedSnapshot.empty;
    const reviewStatuses = reviewSnapshot.docs.map(doc => doc.data().status);
    const allConfirmed = reviewStatuses.every(status => status === '급여확정완료');
    const hasWrongStatus = reviewStatuses.some(status => status === '검토중');
    
    console.log(`   - 급여확정됨: ${hasConfirmedPayroll ? '✅' : '❌'}`);
    console.log(`   - 모든 지점 급여확정완료: ${allConfirmed ? '✅' : '❌'}`);
    console.log(`   - 검토중 상태 있음: ${hasWrongStatus ? '❌' : '✅'}`);
    
    if (hasConfirmedPayroll && hasWrongStatus) {
      console.log('\n🚨 문제 발견: 급여확정되었지만 일부 지점이 검토중 상태입니다!');
      console.log('   → 이 문제를 수정하려면 스크립트를 실행해야 합니다.');
    }
    
  } catch (error) {
    console.error('❌ 상태 확인 실패:', error);
  }
}

// 스크립트 실행
checkEmployeeStatus()
  .then(() => {
    console.log('\n✅ 상태 확인 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 스크립트 실행 실패:', error);
    process.exit(1);
  });
