// 급여확정완료된 직원들의 employeeReviewStatus를 "급여확정완료"로 업데이트하는 스크립트
import { db } from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc,
  writeBatch 
} from 'firebase/firestore';

interface ConfirmedPayroll {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string;
  branchId: string;
  branchName: string;
  confirmedAt: Date;
}

interface EmployeeReviewStatus {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string;
  branchId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

async function updateReviewStatusForConfirmedPayrolls() {
  console.log('🔥 급여확정완료 직원들의 employeeReviewStatus 업데이트 시작...');
  
  try {
    // 1. confirmedPayrolls 컬렉션에서 모든 급여확정 데이터 조회
    const confirmedPayrollsQuery = query(collection(db, 'confirmedPayrolls'));
    const confirmedPayrollsSnapshot = await getDocs(confirmedPayrollsQuery);
    
    console.log(`🔥 총 ${confirmedPayrollsSnapshot.docs.length}개의 급여확정 데이터 발견`);
    
    if (confirmedPayrollsSnapshot.docs.length === 0) {
      console.log('🔥 급여확정 데이터가 없습니다.');
      return;
    }
    
    // 2. 각 급여확정 데이터에 대해 employeeReviewStatus 업데이트
    const batch = writeBatch(db);
    let updateCount = 0;
    let createCount = 0;
    
    for (const payrollDoc of confirmedPayrollsSnapshot.docs) {
      const payrollData = payrollDoc.data() as ConfirmedPayroll;
      
      console.log(`🔥 처리 중: ${payrollData.employeeName} (${payrollData.month})`);
      
      // employeeReviewStatus에서 해당 직원의 상태 조회
      // undefined 값 체크
      if (!payrollData.employeeId || !payrollData.month || !payrollData.branchId) {
        console.log(`  ⚠️ 데이터 누락으로 건너뜀: ${payrollData.employeeName}`, {
          employeeId: payrollData.employeeId,
          month: payrollData.month,
          branchId: payrollData.branchId
        });
        continue;
      }
      
      const reviewStatusQuery = query(
        collection(db, 'employeeReviewStatus'),
        where('employeeId', '==', payrollData.employeeId),
        where('month', '==', payrollData.month),
        where('branchId', '==', payrollData.branchId)
      );
      
      const reviewStatusSnapshot = await getDocs(reviewStatusQuery);
      
      if (reviewStatusSnapshot.docs.length > 0) {
        // 기존 문서 업데이트
        const reviewStatusDoc = reviewStatusSnapshot.docs[0];
        const reviewStatusData = reviewStatusDoc.data() as EmployeeReviewStatus;
        
        if (reviewStatusData.status !== '급여확정완료') {
          batch.update(doc(db, 'employeeReviewStatus', reviewStatusDoc.id), {
            status: '급여확정완료',
            updatedAt: new Date()
          });
          updateCount++;
          console.log(`  ✅ 업데이트: ${payrollData.employeeName} - ${reviewStatusData.status} → 급여확정완료`);
        } else {
          console.log(`  ⏭️ 이미 급여확정완료: ${payrollData.employeeName}`);
        }
      } else {
        // 새 문서 생성
        batch.set(doc(collection(db, 'employeeReviewStatus')), {
          employeeId: payrollData.employeeId,
          employeeName: payrollData.employeeName,
          month: payrollData.month,
          branchId: payrollData.branchId,
          status: '급여확정완료',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        createCount++;
        console.log(`  ➕ 새로 생성: ${payrollData.employeeName}`);
      }
    }
    
    // 3. 배치 실행
    if (updateCount > 0 || createCount > 0) {
      await batch.commit();
      console.log(`🔥 업데이트 완료: ${updateCount}개 업데이트, ${createCount}개 생성`);
    } else {
      console.log('🔥 업데이트할 데이터가 없습니다.');
    }
    
  } catch (error) {
    console.error('🔥 업데이트 실패:', error);
    throw error;
  }
}

// 스크립트 실행 함수
export async function runUpdateReviewStatusScript() {
  try {
    await updateReviewStatusForConfirmedPayrolls();
    console.log('🔥 스크립트 실행 완료');
  } catch (error) {
    console.error('🔥 스크립트 실행 실패:', error);
  }
}

// 직접 실행 (개발용)
if (require.main === module) {
  runUpdateReviewStatusScript();
}
