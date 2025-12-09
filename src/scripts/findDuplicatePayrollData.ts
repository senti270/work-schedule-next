import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

// Firebase 설정 (프로젝트와 동일하게)
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

interface WorkTimeComparisonResult {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string;
  date: string;
  branchId: string;
  branchName: string;
  scheduledHours: number;
  actualHours: number;
  actualWorkHours: number;
  posTimeRange: string;
  isManual: boolean;
  createdAt: Date | null;
}

async function findDuplicatePayrollData(month: string) {
  try {
    console.log(`🔍 중복 데이터 검색 시작: ${month}`);
    
    // 1. 해당 월의 workTimeComparisonResults 조회
    const comparisonQuery = query(
      collection(db, 'workTimeComparisonResults'),
      where('month', '==', month)
    );
    
    const comparisonSnapshot = await getDocs(comparisonQuery);
    console.log(`📊 조회된 데이터 수: ${comparisonSnapshot.docs.length}건`);
    
    if (comparisonSnapshot.docs.length === 0) {
      console.log('✅ 데이터가 없습니다.');
      return;
    }
    
    // 2. 직원 정보 맵 생성
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employeeMap = new Map<string, string>();
    employeesSnapshot.docs.forEach(doc => {
      employeeMap.set(doc.id, doc.data().name || '');
    });
    
    // 3. 데이터 파싱
    const results: WorkTimeComparisonResult[] = comparisonSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        employeeId: data.employeeId || '',
        employeeName: data.employeeName || employeeMap.get(data.employeeId || '') || '알 수 없음',
        month: data.month || '',
        date: data.date || '',
        branchId: data.branchId || '',
        branchName: data.branchName || '',
        scheduledHours: data.scheduledHours || 0,
        actualHours: data.actualHours || 0,
        actualWorkHours: data.actualWorkHours || 0,
        posTimeRange: data.posTimeRange || '',
        isManual: data.isManual === true,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || null)
      };
    });
    
    // 4. 중복 그룹 찾기 (employeeId + date + actualWorkHours 조합)
    const duplicateGroups = new Map<string, WorkTimeComparisonResult[]>();
    
    for (const result of results) {
      // 중복 키: employeeId + date + actualWorkHours
      // actualWorkHours가 0이면 scheduledHours도 고려
      const workHours = result.actualWorkHours > 0 ? result.actualWorkHours : result.scheduledHours;
      const key = `${result.employeeId}|${result.date}|${workHours}`;
      
      if (!duplicateGroups.has(key)) {
        duplicateGroups.set(key, []);
      }
      duplicateGroups.get(key)!.push(result);
    }
    
    // 5. 중복이 있는 그룹만 필터링 (2개 이상인 경우)
    const duplicates: Array<{ key: string; group: WorkTimeComparisonResult[] }> = [];
    
    for (const [key, group] of duplicateGroups.entries()) {
      if (group.length > 1) {
        duplicates.push({ key, group });
      }
    }
    
    if (duplicates.length === 0) {
      console.log('\n✅ 중복 데이터가 없습니다.');
      return;
    }
    
    // 6. 결과 출력
    console.log(`\n🔍 중복 데이터 발견: ${duplicates.length}개 그룹\n`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`직원이름 | 날짜 | 지점명 | 근무시간 | 중복개수`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    let totalDuplicates = 0;
    
    for (const { key, group } of duplicates) {
      const [employeeId, date, workHours] = key.split('|');
      const employeeName = group[0].employeeName;
      
      // 지점명 목록 (중복 제거)
      const branchNames = [...new Set(group.map(item => item.branchName || item.branchId || '미지정'))];
      const branchNamesStr = branchNames.join(', ');
      
      console.log(`${employeeName} | ${date} | ${branchNamesStr} | ${workHours}시간 | ${group.length}개`);
      
      // 상세 정보
      group.forEach((item, index) => {
        console.log(`  └─ ${index + 1}. [${item.id}] ${item.branchName || item.branchId || '미지정'} - ${item.actualWorkHours}시간 (${item.isManual ? '수동' : '자동'})`);
      });
      console.log('');
      
      totalDuplicates += group.length - 1; // 하나만 남기고 나머지 개수
    }
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n📊 통계:`);
    console.log(`   - 중복 그룹 수: ${duplicates.length}개`);
    console.log(`   - 중복 문서 수: ${totalDuplicates}개 (삭제 대상)`);
    console.log(`   - 총 문서 수: ${comparisonSnapshot.docs.length}개`);
    console.log(`   - 중복 제거 후 예상 문서 수: ${comparisonSnapshot.docs.length - totalDuplicates}개\n`);
    
  } catch (error) {
    console.error('❌ 중복 데이터 검색 중 오류:', error);
    throw error;
  }
}

// 사용 예시
async function main() {
  // 2025.11월 급여 데이터 중복 검색
  await findDuplicatePayrollData('2025-11');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

