require('dotenv').config({ path: '.env.local' });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyD1g8ühKf_L4e_d9M9ZvQXxZ7TbVqY",
  authDomain: "workschedule-8fc6f.firebaseapp.com",
  projectId: "workschedule-8fc6f",
  storageBucket: "workschedule-8fc6f.firebasestorage.app",
  messagingSenderId: "590599936109",
  appId: "1:590599936109:web:5fde7f67c6cf8b7d40d4af",
  measurementId: "G-4BMRR3GMFR"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function debugImHyangSun() {
  console.log('=== 임향순 직원목록 미표시 문제 진단 ===\n');

  // 1. 임향순 직원 기본 정보
  const employeesSnapshot = await getDocs(collection(db, 'employees'));
  const imhyangsun = employeesSnapshot.docs.find(doc => doc.data().name === '임향순');
  
  if (!imhyangsun) {
    console.log('❌ 임향순 직원을 찾을 수 없습니다.');
    return;
  }
  
  const imhyangsunData = imhyangsun.data();
  console.log('✅ 임향순 직원 기본 정보:');
  console.log('  - ID:', imhyangsun.id);
  console.log('  - 이름:', imhyangsunData.name);
  console.log('  - 스케줄미노출:', imhyangsunData.hideFromSchedule);
  console.log('  - 퇴사일:', imhyangsunData.resignationDate?.toDate?.() || imhyangsunData.resignationDate || '없음');
  console.log('  - 입사일:', imhyangsunData.hireDate?.toDate?.() || imhyangsunData.hireDate || '없음');
  
  // 2. 9월 근로계약 정보 확인
  console.log('\n✅ 9월 근로계약 정보:');
  const contractsQuery = query(
    collection(db, 'employmentContracts'),
    where('employeeId', '==', imhyangsun.id)
  );
  const contractsSnapshot = await getDocs(contractsQuery);
  
  if (contractsSnapshot.empty) {
    console.log('  ❌ 근로계약 정보가 없습니다.');
  } else {
    const targetDate = new Date('2025-09');
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
    
    console.log(`  검색 기간: ${monthStart.toISOString().split('T')[0]} ~ ${monthEnd.toISOString().split('T')[0]}`);
    
    contractsSnapshot.docs.forEach((doc, idx) => {
      const contract = doc.data();
      const startDate = contract.startDate?.toDate?.() || contract.startDate;
      const endDate = contract.endDate?.toDate?.() || contract.endDate;
      
      console.log(`\n  [계약서 ${idx + 1}]`);
      console.log('  - ID:', doc.id);
      console.log('  - 시작일:', startDate || '없음');
      console.log('  - 종료일:', endDate || '없음');
      console.log('  - 고용형태:', contract.employmentType || '없음');
      console.log('  - 급여타입:', contract.salaryType || '없음');
      console.log('  - 급여금액:', contract.salaryAmount || '없음');
      
      // 9월에 유효한지 확인
      if (startDate) {
        const isStartValid = startDate <= monthEnd;
        const isEndValid = !endDate || endDate >= monthStart;
        const isValid = isStartValid && isEndValid;
        
        console.log('  - 9월 유효성:', {
          isStartValid,
          isEndValid,
          isValid,
          reason: !isValid ? (isStartValid ? '종료일이 9월 이전' : '시작일이 9월 이후') : '유효함'
        });
      }
    });
  }
  
  // 3. 직원목록 필터링 로직 시뮬레이션
  console.log('\n✅ 직원목록 필터링 로직 시뮬레이션:');
  
  // 퇴사일 체크
  const resignationDate = imhyangsunData.resignationDate?.toDate?.() || imhyangsunData.resignationDate;
  const hasResignationDate = resignationDate && resignationDate <= new Date();
  console.log('  - 퇴사일 체크:', {
    resignationDate: resignationDate || '없음',
    hasResignationDate,
    status: hasResignationDate ? '퇴사' : '재직'
  });
  
  // 9월 근로계약 유효성 체크
  let hasValidContract = false;
  if (!contractsSnapshot.empty) {
    const targetDate = new Date('2025-09');
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
    
    hasValidContract = contractsSnapshot.docs.some(doc => {
      const contract = doc.data();
      const startDate = contract.startDate?.toDate?.() || contract.startDate;
      const endDate = contract.endDate?.toDate?.() || contract.endDate;
      
      if (!startDate) return false;
      const isStartValid = startDate <= monthEnd;
      const isEndValid = !endDate || endDate >= monthStart;
      return isStartValid && isEndValid;
    });
  }
  
  console.log('  - 9월 근로계약 유효성:', hasValidContract);
  
  // 최종 표시 여부
  const shouldShow = !hasResignationDate && hasValidContract;
  console.log('  - 최종 표시 여부:', shouldShow);
  
  if (!shouldShow) {
    console.log('\n❌ 임향순이 직원목록에 표시되지 않는 이유:');
    if (hasResignationDate) {
      console.log('  → 퇴사일이 설정되어 있음');
    }
    if (!hasValidContract) {
      console.log('  → 9월에 유효한 근로계약이 없음');
    }
  } else {
    console.log('\n✅ 임향순이 직원목록에 표시되어야 함');
  }
}

debugImHyangSun()
  .then(() => {
    console.log('\n진단 완료!');
    process.exit(0);
  })
  .catch(error => {
    console.error('오류:', error);
    process.exit(1);
  });
