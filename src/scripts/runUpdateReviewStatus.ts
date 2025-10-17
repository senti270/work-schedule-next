// 급여확정완료 직원들의 employeeReviewStatus 업데이트 스크립트 실행
import { runUpdateReviewStatusScript } from './updateReviewStatusForConfirmedPayrolls';

// 스크립트 실행
runUpdateReviewStatusScript()
  .then(() => {
    console.log('✅ 스크립트 실행 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 스크립트 실행 실패:', error);
    process.exit(1);
  });
