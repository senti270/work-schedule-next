import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, deleteDoc, doc, writeBatch } from 'firebase/firestore';

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
  posTimeRange: string;
  isManual: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

async function removeDuplicateWorkTimeComparison(employeeName: string, month: string) {
  try {
    console.log(`🔥 중복 데이터 정리 시작: ${employeeName} - ${month}`);
    
    // 1. 직원 ID 찾기
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employee = employeesSnapshot.docs.find(doc => doc.data().name === employeeName);
    
    if (!employee) {
      console.error(`❌ 직원을 찾을 수 없습니다: ${employeeName}`);
      return;
    }
    
    const employeeId = employee.id;
    console.log(`✅ 직원 ID 찾음: ${employeeId}`);
    
    // 2. 해당 월의 workTimeComparisonResults 조회
    const comparisonQuery = query(
      collection(db, 'workTimeComparisonResults'),
      where('employeeId', '==', employeeId),
      where('month', '==', month)
    );
    
    const comparisonSnapshot = await getDocs(comparisonQuery);
    console.log(`📊 조회된 데이터 수: ${comparisonSnapshot.docs.length}건`);
    
    if (comparisonSnapshot.docs.length === 0) {
      console.log('✅ 중복 데이터가 없습니다.');
      return;
    }
    
    // 3. 데이터 파싱
    const results: WorkTimeComparisonResult[] = comparisonSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        employeeId: data.employeeId || '',
        employeeName: data.employeeName || '',
        month: data.month || '',
        date: data.date || '',
        branchId: data.branchId || '',
        posTimeRange: data.posTimeRange || '',
        isManual: data.isManual === true,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt || null),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt || null)
      };
    });
    
    // 4. 중복 그룹 찾기 (date, branchId, posTimeRange 조합)
    const duplicateGroups = new Map<string, WorkTimeComparisonResult[]>();
    
    for (const result of results) {
      // 중복 키: date + branchId + posTimeRange
      const key = `${result.date}|${result.branchId}|${result.posTimeRange || ''}`;
      
      if (!duplicateGroups.has(key)) {
        duplicateGroups.set(key, []);
      }
      duplicateGroups.get(key)!.push(result);
    }
    
    // 5. 중복이 있는 그룹만 필터링 (2개 이상인 경우)
    const duplicatesToRemove: string[] = [];
    let totalDuplicates = 0;
    
    for (const [key, group] of duplicateGroups.entries()) {
      if (group.length > 1) {
        console.log(`\n🔍 중복 발견: ${key} (${group.length}개)`);
        totalDuplicates += group.length - 1; // 하나만 남기고 나머지 삭제
        
        // 정렬: isManual이 true인 것 우선, 그 다음 createdAt이 가장 오래된 것 (또는 updatedAt이 가장 최신인 것)
        group.sort((a, b) => {
          // 1순위: isManual이 true인 것 우선
          if (a.isManual && !b.isManual) return -1;
          if (!a.isManual && b.isManual) return 1;
          
          // 2순위: createdAt이 있는 것 우선
          if (a.createdAt && !b.createdAt) return -1;
          if (!a.createdAt && b.createdAt) return 1;
          
          // 3순위: createdAt이 오래된 것 우선 (오래된 데이터가 더 정확할 수 있음)
          if (a.createdAt && b.createdAt) {
            return a.createdAt.getTime() - b.createdAt.getTime();
          }
          
          // 4순위: updatedAt이 최신인 것 우선
          if (a.updatedAt && b.updatedAt) {
            return b.updatedAt.getTime() - a.updatedAt.getTime();
          }
          
          return 0;
        });
        
        // 첫 번째 것만 남기고 나머지 삭제 대상에 추가
        const toKeep = group[0];
        const toRemove = group.slice(1);
        
        console.log(`  ✅ 유지할 문서: ${toKeep.id} (isManual: ${toKeep.isManual}, createdAt: ${toKeep.createdAt})`);
        
        for (const item of toRemove) {
          console.log(`  ❌ 삭제할 문서: ${item.id} (isManual: ${item.isManual}, createdAt: ${item.createdAt})`);
          duplicatesToRemove.push(item.id);
        }
      }
    }
    
    if (duplicatesToRemove.length === 0) {
      console.log('\n✅ 중복 데이터가 없습니다.');
      return;
    }
    
    // 6. 삭제 실행
    console.log(`\n🗑️  삭제할 문서 수: ${duplicatesToRemove.length}개`);
    
    // 배치 삭제 (최대 500개씩)
    const batch = writeBatch(db);
    let batchCount = 0;
    let deletedCount = 0;
    
    for (const docId of duplicatesToRemove) {
      batch.delete(doc(db, 'workTimeComparisonResults', docId));
      batchCount++;
      deletedCount++;
      
      // Firestore 배치 제한 (500개)에 도달하면 커밋
      if (batchCount >= 500) {
        await batch.commit();
        console.log(`  ✅ ${batchCount}개 문서 삭제 완료`);
        batchCount = 0;
      }
    }
    
    // 남은 문서들 커밋
    if (batchCount > 0) {
      await batch.commit();
      console.log(`  ✅ ${batchCount}개 문서 삭제 완료`);
    }
    
    console.log(`\n🎉 중복 데이터 정리 완료!`);
    console.log(`총 ${deletedCount}개 문서가 삭제되었습니다.`);
    console.log(`남은 문서 수: ${comparisonSnapshot.docs.length - deletedCount}개`);
    
  } catch (error) {
    console.error('❌ 중복 데이터 정리 중 오류:', error);
    throw error;
  }
}

// 사용 예시
async function main() {
  // 하린 직원의 2025.11 중복 데이터 정리
  await removeDuplicateWorkTimeComparison('하린', '2025-11');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

