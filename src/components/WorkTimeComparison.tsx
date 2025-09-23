'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Schedule {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  date: Date;
  startTime: string;
  endTime: string;
  breakTime: string;
  totalHours: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ActualWorkRecord {
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  employeeName?: string; // 파싱 후 매칭을 위해 추가
}

interface WorkTimeComparison {
  employeeName: string;
  date: string;
  scheduledHours: number;
  actualHours: number;
  difference: number;
  status: 'time_match' | 'review_required' | 'review_completed';
  scheduledTimeRange?: string; // "19:00-22:00" 형태
  actualTimeRange?: string; // "19:00-22:11" 형태
  isModified?: boolean; // 수정 여부
  // 휴게시간 및 실근무시간
  breakTime?: number; // 휴게시간 (시간)
  actualWorkHours?: number; // 실근무시간 (실제근무시간 - 휴게시간)
}

interface WorkTimeComparisonProps {
  userBranch?: {
    id: string;
    name: string;
    managerEmail?: string;
  } | null;
  isManager?: boolean;
}

export default function WorkTimeComparison({ userBranch, isManager }: WorkTimeComparisonProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [actualWorkData, setActualWorkData] = useState<string>('');
  const [comparisonResults, setComparisonResults] = useState<WorkTimeComparison[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<{
    id: string; 
    name: string; 
    branchId: string; 
    type?: string;
    employmentType?: string;
    salaryType?: string;
  }[]>([]);
  const [branches, setBranches] = useState<{id: string; name: string}[]>([]);
  const [employeeReviewStatus, setEmployeeReviewStatus] = useState<{employeeId: string, status: '검토전' | '검토중' | '검토완료'}[]>([]);
  const [payrollConfirmedEmployees, setPayrollConfirmedEmployees] = useState<string[]>([]);
  const [employeeMemos, setEmployeeMemos] = useState<{[employeeId: string]: string}>({});
  
  // 전월 이월 연장근무시간 입력 팝업 상태
  const [showOvertimePopup, setShowOvertimePopup] = useState(false);
  const [overtimeInput, setOvertimeInput] = useState('');
  const [pendingOvertimeCalculation, setPendingOvertimeCalculation] = useState<{
    employeeId: string;
    currentWeekStart: Date;
    actualWorkHours: number;
  } | null>(null);
  const [hasShownOvertimePopup, setHasShownOvertimePopup] = useState(false); // 팝업 표시 여부 추적

  useEffect(() => {
    loadBranches();
    loadEmployees();
    // 현재 월을 기본값으로 설정
    const now = new Date();
    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    
    // 매니저인 경우 해당 지점을 기본값으로 설정
    if (isManager && userBranch) {
      setSelectedBranchId(userBranch.id);
    }
  }, [isManager, userBranch]);

  // 지점이나 월이 변경될 때 직원 목록 다시 로드
  useEffect(() => {
    if ((selectedBranchId || (isManager && userBranch)) && selectedMonth) {
      loadEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, isManager, userBranch, selectedMonth]);

  // 지점이나 직원이 변경될 때 스케줄 다시 로드
  useEffect(() => {
    if (selectedMonth) {
      loadSchedules(selectedMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, selectedEmployeeId, selectedMonth]);

  // 직원이 변경될 때 실제근무데이터 초기화 및 기존 데이터 로드
  useEffect(() => {
    console.log('직원 변경 useEffect 실행:', selectedEmployeeId, selectedMonth);
    if (selectedEmployeeId) {
      // 직원이 변경되면 실제근무데이터 초기화
      setActualWorkData('');
      
      // 먼저 비교 결과 초기화 (다른 직원 데이터가 보이지 않도록)
      setComparisonResults([]);
      
      // 팝업 표시 상태 초기화 (새 직원 선택 시 팝업 다시 표시 가능)
      setHasShownOvertimePopup(false);
      
      // 기존 비교 데이터가 있는지 확인하고 로드
      console.log('loadExistingComparisonData 호출 예정');
      loadExistingComparisonData();
    } else {
      // 직원이 선택되지 않았으면 비교 결과 초기화
      setComparisonResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId, selectedMonth]);

  const loadBranches = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || ''
      }));
      setBranches(branchesData);
    } catch (error) {
      console.error('지점 목록을 불러올 수 없습니다:', error);
    }
  };

  // 급여확정된 직원 목록 로드
  const loadPayrollConfirmedEmployees = async () => {
    try {
      if (!selectedMonth) return;
      
      const payrollQuery = query(
        collection(db, 'payrollRecords'),
        where('month', '==', selectedMonth),
        where('branchId', '==', selectedBranchId)
      );
      const payrollSnapshot = await getDocs(payrollQuery);
      
      const confirmedEmployeeIds = payrollSnapshot.docs.map(doc => doc.data().employeeId);
      setPayrollConfirmedEmployees(confirmedEmployeeIds);
      console.log('급여확정된 직원 목록:', confirmedEmployeeIds);
    } catch (error) {
      console.error('급여확정 직원 목록 로드 실패:', error);
    }
  };

  // 직원별 급여메모 로드
  const loadEmployeeMemos = async () => {
    try {
      if (!selectedMonth) return;
      
      const memosQuery = query(
        collection(db, 'employeeMemos'),
        where('month', '==', selectedMonth)
      );
      const memosSnapshot = await getDocs(memosQuery);
      
      const memosMap: {[employeeId: string]: string} = {};
      memosSnapshot.docs.forEach(doc => {
        const data = doc.data();
        memosMap[data.employeeId] = data.memo || '';
      });
      
      setEmployeeMemos(memosMap);
      console.log('직원별 급여메모 로드됨:', memosMap);
      
    } catch (error) {
      console.error('직원별 급여메모 로드 실패:', error);
    }
  };

  // 직원별 급여메모 저장
  const saveEmployeeMemo = async (employeeId: string, memo: string) => {
    try {
      const memoRecord = {
        employeeId,
        memo,
        month: selectedMonth,
        updatedAt: new Date()
      };

      // 기존 메모가 있는지 확인 (지점별 필터링 제거)
      const existingQuery = query(
        collection(db, 'employeeMemos'),
        where('employeeId', '==', employeeId),
        where('month', '==', selectedMonth)
      );
      const existingDocs = await getDocs(existingQuery);
      
      if (existingDocs.empty) {
        // 새로 추가
        await addDoc(collection(db, 'employeeMemos'), memoRecord);
        console.log('새로운 직원 메모 저장됨:', memoRecord);
      } else {
        // 기존 데이터 업데이트
        const docId = existingDocs.docs[0].id;
        await updateDoc(doc(db, 'employeeMemos', docId), memoRecord);
        console.log('기존 직원 메모 업데이트됨:', memoRecord);
      }
      
      // 로컬 상태 업데이트
      setEmployeeMemos(prev => ({
        ...prev,
        [employeeId]: memo
      }));
      
    } catch (error) {
      console.error('직원 메모 저장 실패:', error);
    }
  };

  // 급여확정 여부 확인
  const isPayrollConfirmed = (employeeId: string) => {
    return payrollConfirmedEmployees.includes(employeeId);
  };

  // 중복 데이터 정리 함수
  const cleanupDuplicateRecords = async () => {
    try {
      if (!selectedMonth) return;
      
      console.log('중복 데이터 정리 시작...');
      
      // 해당 월, 해당 지점의 모든 actualWorkRecords 조회
      const allRecordsQuery = query(
        collection(db, 'actualWorkRecords'),
        where('month', '==', selectedMonth),
        where('branchId', '==', selectedBranchId)
      );
      const allRecordsSnapshot = await getDocs(allRecordsQuery);
      
      // 직원별, 날짜별로 그룹화
      const groupedRecords = new Map<string, Array<{id: string; employeeId: string; date: string; [key: string]: unknown}>>();
      
      allRecordsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const key = `${data.employeeId}_${data.date}`;
        
        if (!groupedRecords.has(key)) {
          groupedRecords.set(key, []);
        }
        groupedRecords.get(key)!.push({ id: doc.id, employeeId: data.employeeId, date: data.date, ...data });
      });
      
      // 중복 데이터 정리
      let cleanupCount = 0;
      for (const [key, records] of groupedRecords) {
        if (records.length > 1) {
          console.log(`중복 발견: ${key}, ${records.length}개 레코드`);
          
          // 가장 최근에 수정된 레코드를 제외하고 나머지 삭제
          const sortedRecords = records.sort((a, b) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const aTime = (a.modifiedAt as any)?.toDate?.() || (a.createdAt as any)?.toDate?.() || new Date(0);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bTime = (b.modifiedAt as any)?.toDate?.() || (b.createdAt as any)?.toDate?.() || new Date(0);
            return bTime.getTime() - aTime.getTime();
          });
          
          // 첫 번째(가장 최근) 레코드는 유지하고 나머지 삭제
          for (let i = 1; i < sortedRecords.length; i++) {
            await deleteDoc(doc(db, 'actualWorkRecords', sortedRecords[i].id));
            cleanupCount++;
            console.log(`중복 레코드 삭제: ${sortedRecords[i].id}`);
          }
        }
      }
      
      if (cleanupCount > 0) {
        console.log(`중복 데이터 정리 완료: ${cleanupCount}개 레코드 삭제`);
      } else {
        console.log('중복 데이터 없음');
      }
    } catch (error) {
      console.error('중복 데이터 정리 실패:', error);
    }
  };

  // 검토 상태를 DB에 저장
  const saveReviewStatus = async (employeeId: string, status: '검토전' | '검토중' | '검토완료') => {
    try {
      console.log('검토 상태 저장 시작:', { employeeId, status, selectedMonth, selectedBranchId });
      
      const reviewStatusRecord = {
        employeeId,
        status,
        month: selectedMonth,
        branchId: selectedBranchId,
        updatedAt: new Date()
      };

      // 기존 상태가 있는지 확인
      const existingQuery = query(
        collection(db, 'employeeReviewStatus'),
        where('employeeId', '==', employeeId),
        where('month', '==', selectedMonth)
      );
      
      const existingDocs = await getDocs(existingQuery);
      console.log('기존 검토 상태 쿼리 결과:', existingDocs.docs.length, '개');
      
      if (existingDocs.empty) {
        // 새로 추가
        await addDoc(collection(db, 'employeeReviewStatus'), reviewStatusRecord);
        console.log('새로운 검토 상태 저장됨:', reviewStatusRecord);
      } else {
        // 기존 데이터 업데이트
        const docId = existingDocs.docs[0].id;
        await updateDoc(doc(db, 'employeeReviewStatus', docId), reviewStatusRecord);
        console.log('기존 검토 상태 업데이트됨:', reviewStatusRecord);
      }
    } catch (error) {
      console.error('검토 상태 저장 실패:', error);
    }
  };

  // 검토 상태를 DB에서 로드하고, 없는 경우 기존 비교 데이터로 상태 설정
  const loadReviewStatus = async (employeesList: typeof employees) => {
    try {
      if (!selectedMonth) return;
      
      console.log('검토 상태 로드 시작 - 선택된 월:', selectedMonth);
      
      const reviewStatusQuery = query(
        collection(db, 'employeeReviewStatus'),
        where('month', '==', selectedMonth),
        where('branchId', '==', selectedBranchId)
      );
      const reviewStatusSnapshot = await getDocs(reviewStatusQuery);
      
      console.log('검토 상태 쿼리 결과 문서 수:', reviewStatusSnapshot.docs.length);
      
      const savedReviewStatuses = reviewStatusSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('저장된 검토 상태 데이터:', data);
        return {
          employeeId: data.employeeId,
          status: data.status as '검토전' | '검토중' | '검토완료'
        };
      });
      
      console.log('DB에서 로드된 검토 상태:', savedReviewStatuses);
      
      // 모든 직원에 대해 상태 설정
      const allReviewStatuses = await Promise.all(
        employeesList.map(async (employee) => {
          // DB에 저장된 상태가 있으면 사용
          const savedStatus = savedReviewStatuses.find(status => status.employeeId === employee.id);
          if (savedStatus) {
            console.log(`직원 ${employee.name}의 저장된 상태 사용:`, savedStatus.status);
            return savedStatus;
          }
          
          // DB에 상태가 없으면 기존 비교 데이터 확인
          try {
            const existingDataQuery = query(
              collection(db, 'actualWorkRecords'),
              where('employeeId', '==', employee.id),
              where('month', '==', selectedMonth),
              where('branchId', '==', selectedBranchId)
            );
            const existingDataSnapshot = await getDocs(existingDataQuery);
            
            if (!existingDataSnapshot.empty) {
              console.log(`직원 ${employee.name}의 기존 비교 데이터 발견, 검토중으로 설정`);
              return {
                employeeId: employee.id,
                status: '검토중' as '검토전' | '검토중' | '검토완료'
              };
            } else {
              console.log(`직원 ${employee.name}의 비교 데이터 없음, 검토전으로 설정`);
              return {
                employeeId: employee.id,
                status: '검토전' as '검토전' | '검토중' | '검토완료'
              };
            }
          } catch (error) {
            console.error(`직원 ${employee.name}의 상태 확인 실패:`, error);
            return {
              employeeId: employee.id,
              status: '검토전' as '검토전' | '검토중' | '검토완료'
            };
          }
        })
      );
      
      setEmployeeReviewStatus(allReviewStatuses);
      console.log('최종 검토 상태 설정됨:', allReviewStatuses);
    } catch (error) {
      console.error('검토 상태 로드 실패:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      // 선택된 월이 없으면 빈 배열로 설정
      if (!selectedMonth) {
        setEmployees([]);
        setEmployeeReviewStatus([]);
        return;
      }

      // 먼저 해당 월의 스케줄을 로드하여 스케줄이 있는 직원들을 찾음
      const [year, monthNum] = selectedMonth.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

      const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
      const schedulesData = schedulesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          employeeId: data.employeeId,
          employeeName: data.employeeName,
          branchId: data.branchId,
          branchName: data.branchName,
          date: data.date?.toDate ? data.date.toDate() : new Date(),
          startTime: data.startTime,
          endTime: data.endTime,
          breakTime: data.breakTime,
          totalHours: data.totalHours,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
      });

      // 선택된 월의 스케줄만 필터링
      let filteredSchedules = schedulesData.filter(schedule => {
        const scheduleDate = new Date(schedule.date);
        return scheduleDate >= startDate && scheduleDate <= endDate;
      });

      // 선택된 지점으로 필터링
      if (selectedBranchId) {
        filteredSchedules = filteredSchedules.filter(schedule => schedule.branchId === selectedBranchId);
      } else if (isManager && userBranch) {
        // 매니저 권한이 있으면 해당 지점만 필터링
        filteredSchedules = filteredSchedules.filter(schedule => schedule.branchId === userBranch.id);
      }

      // 스케줄이 있는 직원들의 고유 ID 추출
      const employeeIdsWithSchedules = [...new Set(filteredSchedules.map(schedule => schedule.employeeId))];
      
      if (employeeIdsWithSchedules.length === 0) {
        setEmployees([]);
        setEmployeeReviewStatus([]);
        return;
      }

      // 스케줄이 있는 직원들의 정보만 로드
      const employeesData = [];
      for (const employeeId of employeeIdsWithSchedules) {
        const employeeDoc = await getDocs(query(collection(db, 'employees'), where('__name__', '==', employeeId)));
        if (!employeeDoc.empty) {
          const doc = employeeDoc.docs[0];
          
          // 최신 근로계약 정보 가져오기
          const contractsQuery = query(
            collection(db, 'employmentContracts'),
            where('employeeId', '==', employeeId)
          );
          const contractsSnapshot = await getDocs(contractsQuery);
          
          let employmentType = '';
          let salaryType = '';
          
          if (!contractsSnapshot.empty) {
            // 최신 계약서 찾기 (기준일 기준으로 정렬)
            const contracts = contractsSnapshot.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                startDate: data.startDate?.toDate() || new Date(),
                employmentType: data.employmentType || '',
                salaryType: data.salaryType || ''
              };
            });
            contracts.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
            
            const latestContract = contracts[0];
            employmentType = latestContract.employmentType || '';
            salaryType = latestContract.salaryType || '';
          }
          
          employeesData.push({
            id: doc.id,
            name: doc.data().name || '',
            branchId: doc.data().branchId || '',
            type: doc.data().type || '',
            employmentType: employmentType,
            salaryType: salaryType
          });
        }
      }
      
      // 기존 '정규직' 데이터를 '근로소득자'로 변경하는 임시 수정 로직
      for (const employee of employeesData) {
        if (employee.type === '정규직') {
          console.log(`직원 ${employee.name}의 고용형태를 '정규직'에서 '근로소득자'로 변경합니다.`);
          try {
            const employeeRef = doc(db, 'employees', employee.id);
            await updateDoc(employeeRef, {
              type: '근로소득자',
              updatedAt: new Date()
            });
            employee.type = '근로소득자'; // 로컬 상태도 업데이트
          } catch (error) {
            console.error(`직원 ${employee.name}의 고용형태 업데이트 실패:`, error);
          }
        }
      }
      
      setEmployees(employeesData);
      
      // 중복 데이터 정리 (한 번만 실행)
      await cleanupDuplicateRecords();
      
      // DB에서 검토 상태 로드 (직원 목록이 설정된 후)
      await loadReviewStatus(employeesData);
      
      // 급여확정된 직원 목록도 함께 로드
      await loadPayrollConfirmedEmployees();
      
      // 직원별 급여메모도 함께 로드
      await loadEmployeeMemos();
    } catch (error) {
      console.error('직원 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadSchedules = async (month: string) => {
    try {
      setLoading(true);
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

      const querySnapshot = await getDocs(collection(db, 'schedules'));
      const schedulesData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          employeeId: data.employeeId,
          employeeName: data.employeeName,
          branchId: data.branchId,
          branchName: data.branchName,
          date: data.date?.toDate ? data.date.toDate() : new Date(),
          startTime: data.startTime,
          endTime: data.endTime,
          breakTime: data.breakTime,
          totalHours: data.totalHours,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
      });

      // 선택된 월의 스케줄만 필터링
      let filteredSchedules = schedulesData.filter(schedule => {
        const scheduleDate = new Date(schedule.date);
        return scheduleDate >= startDate && scheduleDate <= endDate;
      });

      // 선택된 지점으로 필터링
      if (selectedBranchId) {
        filteredSchedules = filteredSchedules.filter(schedule => schedule.branchId === selectedBranchId);
      } else if (isManager && userBranch) {
        // 매니저 권한이 있으면 해당 지점만 필터링
        filteredSchedules = filteredSchedules.filter(schedule => schedule.branchId === userBranch.id);
      }

      // 선택된 직원으로 필터링
      if (selectedEmployeeId) {
        filteredSchedules = filteredSchedules.filter(schedule => schedule.employeeId === selectedEmployeeId);
      }

      setSchedules(filteredSchedules);
    } catch (error) {
      console.error('스케줄 로드 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseActualWorkData = (data: string): ActualWorkRecord[] => {
    const lines = data.trim().split('\n');
    const records: ActualWorkRecord[] = [];

    console.log('실제근무 데이터 파싱 시작, 총 라인 수:', lines.length);

    lines.forEach((line, index) => {
      if (line.trim()) {
        const columns = line.split('\t');
        console.log(`라인 ${index + 1}:`, columns);
        
        if (columns.length >= 8) {
          // POS 데이터 형식: 첫 번째 날짜는 무시, 두 번째가 시작일시, 세 번째가 종료일시
          const startTime = columns[1].trim(); // "2025-09-15 10:05:07"
          const endTime = columns[2].trim(); // "2025-09-15 21:59:15"
          
          // 시작일시에서 날짜 추출 (YYYY-MM-DD 형식)
          const date = startTime.split(' ')[0]; // "2025-09-15"
          
          // 여러 컬럼에서 시간 정보 찾기
          let totalTimeStr = '';
          let totalHours = 0;
          
          // 7번째 컬럼부터 12번째 컬럼까지 시간 형식 찾기
          for (let i = 6; i < Math.min(columns.length, 12); i++) {
            const colValue = columns[i].trim();
            if (colValue.includes(':') && colValue.match(/^\d+:\d+$/)) {
              totalTimeStr = colValue;
              console.log(`시간 발견: 컬럼 ${i} = "${colValue}"`);
              break;
            }
          }
          
          // 시간을 찾지 못한 경우 시작/종료 시간으로 계산
          if (!totalTimeStr) {
            try {
              const start = new Date(startTime);
              const end = new Date(endTime);
              const diffMs = end.getTime() - start.getTime();
              totalHours = diffMs / (1000 * 60 * 60); // 시간 단위로 변환
              console.log(`시간 계산: ${startTime} ~ ${endTime} = ${totalHours}시간`);
            } catch (error) {
              console.error('시간 계산 오류:', error);
            }
          }

          console.log(`전체 컬럼 정보:`, columns.map((col, idx) => `${idx}: "${col}"`));
          console.log(`파싱된 데이터: 날짜=${date}, 시작=${startTime}, 종료=${endTime}, 총시간=${totalTimeStr}`);

          // 시간 문자열을 소수점 시간으로 변환 (예: "3:11" -> 3.18)
          if (totalTimeStr) {
            try {
              console.log(`시간 문자열 파싱: "${totalTimeStr}"`);
              
              // 여러 가지 시간 형식 시도
              if (totalTimeStr.includes(':')) {
                const timeParts = totalTimeStr.split(':');
                console.log(`시간 파싱: ${totalTimeStr} -> parts:`, timeParts);
                
                if (timeParts.length === 2) {
                  const hours = parseInt(timeParts[0], 10);
                  const minutes = parseInt(timeParts[1], 10);
                  console.log(`시간 변환: hours=${hours}, minutes=${minutes}`);
                  
                  if (!isNaN(hours) && !isNaN(minutes)) {
                    totalHours = hours + (minutes / 60);
                    console.log(`최종 계산: ${hours} + (${minutes}/60) = ${totalHours}`);
                  } else {
                    console.error('시간 파싱 실패: hours 또는 minutes가 NaN', { hours, minutes });
                  }
                } else {
                  console.error('시간 형식 오류: 콜론이 1개가 아님', timeParts);
                }
              } else {
                // 콜론이 없는 경우 숫자로만 파싱 시도
                const numericValue = parseFloat(totalTimeStr);
                if (!isNaN(numericValue)) {
                  totalHours = numericValue;
                  console.log(`숫자로 파싱: ${totalTimeStr} -> ${totalHours}`);
                } else {
                  console.error('시간 파싱 실패: 숫자도 아니고 시간 형식도 아님', totalTimeStr);
                }
              }
            } catch (error) {
              console.error('시간 파싱 오류:', error, '원본 데이터:', totalTimeStr);
            }
          }

          records.push({
            date,
            startTime,
            endTime,
            totalHours
          });
        } else {
          console.log(`라인 ${index + 1} 컬럼 수 부족:`, columns.length);
        }
      }
    });

    console.log('파싱 완료된 실제근무 데이터:', records);
    return records;
  };

  const compareWorkTimes = async () => {
    console.log('근무시간 비교 시작');
    console.log('선택된 지점:', selectedBranchId);
    console.log('선택된 월:', selectedMonth);
    console.log('선택된 직원:', selectedEmployeeId);
    console.log('실제근무 데이터 길이:', actualWorkData.length);
    console.log('스케줄 개수:', schedules.length);

    // 필수 항목 검증
    if (!selectedBranchId) {
      alert('지점을 선택해주세요.');
      return;
    }

    if (!selectedMonth) {
      alert('월을 선택해주세요.');
      return;
    }

    if (!selectedEmployeeId) {
      alert('직원을 선택해주세요.');
      return;
    }

    if (!actualWorkData.trim()) {
      // 실제근무 데이터가 없어도 스케줄 데이터만으로 리스트 표시
      console.log('실제근무 데이터 없음, 스케줄 데이터만으로 리스트 생성');
      
      const scheduleOnlyComparisons: WorkTimeComparison[] = [];
      
      schedules
        .filter(schedule => schedule.employeeId === selectedEmployeeId)
        .forEach(schedule => {
          const scheduleDate = schedule.date.toISOString().split('T')[0];
          const breakTime = parseFloat(schedule.breakTime) || 0;
          
          scheduleOnlyComparisons.push({
            employeeName: schedule.employeeName,
            date: scheduleDate,
            scheduledHours: schedule.totalHours,
            actualHours: 0, // 실제근무 데이터 없음
            difference: -schedule.totalHours, // 스케줄 시간만큼 마이너스
            status: 'review_required',
            scheduledTimeRange: `${schedule.startTime}-${schedule.endTime}`,
            actualTimeRange: '데이터 없음',
            isModified: false,
            breakTime: breakTime,
            actualWorkHours: 0
          });
        });
      
      console.log('스케줄만으로 생성된 비교 결과:', scheduleOnlyComparisons);
      setComparisonResults(scheduleOnlyComparisons);
      return;
    }

    // 이미 비교결과가 있고 수정된 내용이 있는 경우 경고
    if (comparisonResults.length > 0) {
      const hasModifiedResults = comparisonResults.some(result => result.isModified);
      if (hasModifiedResults) {
        const confirmed = confirm('이미 수정한 근무시간 데이터가 있습니다.\n다시 비교하면 모든 수정내용이 초기화됩니다.\n계속하시겠습니까?');
        if (!confirmed) {
          return;
        }
      }
    }

    const actualRecords = parseActualWorkData(actualWorkData);
    console.log('파싱된 실제근무 데이터:', actualRecords);

    const comparisons: WorkTimeComparison[] = [];
    const processedDates = new Set<string>();

    // 1. 스케줄이 있는 경우: 스케줄과 실제근무 데이터 비교 (선택된 직원만)
    schedules
      .filter(schedule => schedule.employeeId === selectedEmployeeId)
      .forEach(schedule => {
        const scheduleDate = schedule.date.toISOString().split('T')[0];
        const actualRecord = actualRecords.find(record => record.date === scheduleDate);

      console.log(`스케줄: ${schedule.employeeName} ${scheduleDate}`, schedule);
      console.log(`실제근무 데이터 찾기:`, actualRecord);

      if (actualRecord) {
        // 휴게시간과 실근무시간 계산
        const breakTime = parseFloat(schedule.breakTime) || 0; // 휴게시간 (시간)
        const actualWorkHours = Math.max(0, actualRecord.totalHours - breakTime); // 실제 순 근무시간 (실제근무시간 - 휴게시간)
        
        // 차이 계산: 실제순근무시간 - 스케줄시간 (많이 하면 +, 적게 하면 -)
        const difference = actualWorkHours - schedule.totalHours;
        let status: 'time_match' | 'review_required' | 'review_completed' = 'time_match';
        
        // 10분(0.17시간) 이상 차이나면 확인필요, 이내면 시간일치
        if (Math.abs(difference) >= 0.17) {
          status = 'review_required';
        } else {
          status = 'time_match';
        }
        
        comparisons.push({
          employeeName: schedule.employeeName,
          date: scheduleDate,
          scheduledHours: schedule.totalHours,
          actualHours: actualRecord.totalHours,
          difference,
          status,
          scheduledTimeRange: `${schedule.startTime}-${schedule.endTime}`,
          actualTimeRange: formatTimeRange(actualRecord.startTime, actualRecord.endTime),
          isModified: false,
          breakTime: breakTime,
          actualWorkHours: actualWorkHours
        });

        processedDates.add(scheduleDate);
      } else {
        // 스케줄은 있지만 실제근무 데이터가 없는 경우
        // 휴게시간과 실근무시간 계산 (실제근무 데이터가 없는 경우)
        const breakTime = parseFloat(schedule.breakTime) || 0;
        const actualWorkHours = 0; // 실제근무 데이터가 없으므로 0
        
        comparisons.push({
          employeeName: schedule.employeeName,
          date: scheduleDate,
          scheduledHours: schedule.totalHours,
          actualHours: 0,
          difference: -schedule.totalHours,
          status: 'review_required',
          scheduledTimeRange: `${schedule.startTime}-${schedule.endTime}`,
          actualTimeRange: '-',
          isModified: false,
          breakTime: breakTime,
          actualWorkHours: actualWorkHours
        });
      }
    });

    // 2. 실제근무 데이터는 있지만 스케줄이 없는 경우
    actualRecords.forEach(actualRecord => {
      if (!processedDates.has(actualRecord.date)) {
        // 선택된 직원의 이름을 사용 (실제근무 데이터에는 직원명이 없으므로)
        const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);
        const employeeName = selectedEmployee ? selectedEmployee.name : '알 수 없음';

        // 스케줄이 없는 경우 휴게시간은 0으로 가정
        const breakTime = 0; // 스케줄이 없으므로 휴게시간 정보 없음
        const actualWorkHours = actualRecord.totalHours; // 휴게시간이 없으므로 실제근무시간 = 실근무시간
        
        comparisons.push({
          employeeName: employeeName,
          date: actualRecord.date,
          scheduledHours: 0,
          actualHours: actualRecord.totalHours,
          difference: actualRecord.totalHours,
          status: 'review_required', // 스케줄 없이 근무한 경우 검토필요
          scheduledTimeRange: '-',
          actualTimeRange: formatTimeRange(actualRecord.startTime, actualRecord.endTime),
          isModified: false,
          breakTime: breakTime,
          actualWorkHours: actualWorkHours
        });
      }
    });

    // 날짜순으로 정렬
    comparisons.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log('비교 결과:', comparisons);
    setComparisonResults(comparisons);
    
    // 연장근무시간 계산 (정직원인 경우만)
    if (selectedEmployeeId) {
      try {
        // 직원 정보 확인
        const employeeQuery = query(
          collection(db, 'employees'),
          where('__name__', '==', selectedEmployeeId)
        );
        const employeeSnapshot = await getDocs(employeeQuery);
        
        if (!employeeSnapshot.empty) {
          const employeeData = employeeSnapshot.docs[0].data();
          
          // 근로소득자인 경우에만 연장근무시간 계산
          if (employeeData.type === '근로소득자') {
            // 이번주 총 실제 근무시간 계산
            const totalActualHours = comparisons.reduce((sum, comp) => sum + comp.actualHours, 0);
            
            // 이번주 시작일 계산 (월요일)
            const currentDate = new Date(selectedMonth);
            const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const firstMonday = new Date(firstDay);
            const dayOfWeek = firstDay.getDay();
            const daysToMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
            firstMonday.setDate(firstDay.getDate() + daysToMonday);
            
            // 연장근무시간 계산
            const accumulatedOvertime = await calculateOvertimeHours(selectedEmployeeId, firstMonday, totalActualHours);
            console.log('계산된 누적 연장근무시간:', accumulatedOvertime);
          }
        }
      } catch (error) {
        console.error('연장근무시간 계산 중 오류:', error);
      }
    }
    
    // 모든 비교 결과를 DB에 저장
    await saveAllComparisonResults(comparisons);
    
    // 비교결과 데이터가 한건이라도 있으면 검토중으로 상태 변경
    if (comparisons.length > 0) {
      console.log('비교 작업 완료, 검토중 상태로 변경:', selectedEmployeeId);
      setEmployeeReviewStatus(prev => {
        const updated = prev.map(status => 
          status.employeeId === selectedEmployeeId 
            ? { ...status, status: '검토중' as '검토전' | '검토중' | '검토완료' }
            : status
        );
        console.log('비교 작업 후 검토 상태 업데이트:', updated);
        return updated;
      });
    }
    
    // 자동 검토완료 변경 로직 제거 - 수동 버튼으로 변경
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'time_match': return 'text-green-600 bg-green-50';
      case 'review_required': return 'text-orange-600 bg-orange-50';
      case 'review_completed': return 'text-purple-600 bg-purple-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // 비교 결과를 날짜순으로 정렬하는 함수
  const sortComparisonResults = (results: WorkTimeComparison[]) => {
    return [...results].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'time_match': return '시간일치';
      case 'review_required': return '확인필요';
      case 'review_completed': return '확인완료';
      default: return '알 수 없음';
    }
  };

  // 시간 범위 포맷 함수
  const formatTimeRange = (startTime: string, endTime: string) => {
    // "2025-09-11 19:00:10" -> "19:00"
    const start = startTime.split(' ')[1]?.substring(0, 5) || startTime.substring(0, 5);
    const end = endTime.split(' ')[1]?.substring(0, 5) || endTime.substring(0, 5);
    return `${start}-${end}`;
  };

  // 연장근무시간 계산 함수
  const calculateOvertimeHours = async (employeeId: string, currentWeekStart: Date, actualWorkHours: number) => {
    try {
      // 직원 정보에서 주간 근무시간 가져오기
      const employeeQuery = query(
        collection(db, 'employees'),
        where('__name__', '==', employeeId)
      );
      const employeeSnapshot = await getDocs(employeeQuery);
      
      if (employeeSnapshot.empty) {
        console.log('직원 정보를 찾을 수 없습니다:', employeeId);
        return 0;
      }
      
      const employeeData = employeeSnapshot.docs[0].data();
      const weeklyWorkHours = employeeData.weeklyWorkHours || 40; // 기본값 40시간
      
      // 직원의 고용형태 확인 (최신 근로계약서에서)
      const contractsQuery = query(
        collection(db, 'employmentContracts'),
        where('employeeId', '==', employeeId),
        orderBy('startDate', 'desc'),
        limit(1)
      );
      const contractsSnapshot = await getDocs(contractsQuery);
      
      let employmentType = '';
      if (!contractsSnapshot.empty) {
        const contractData = contractsSnapshot.docs[0].data();
        employmentType = contractData.employmentType || '';
      }
      
      console.log('직원 주간 근무시간:', weeklyWorkHours, '실제 근무시간:', actualWorkHours, '고용형태:', employmentType);
      
      // 전주 누적 연장근무시간 가져오기
      const previousWeekStart = new Date(currentWeekStart);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      
      const overtimeQuery = query(
        collection(db, 'overtimeRecords'),
        where('employeeId', '==', employeeId),
        where('weekStart', '==', previousWeekStart)
      );
      
      const overtimeSnapshot = await getDocs(overtimeQuery);
      let previousOvertime = 0;
      
      if (!overtimeSnapshot.empty) {
        previousOvertime = overtimeSnapshot.docs[0].data().accumulatedOvertime || 0;
      } else {
        // 전주 누적 연장근무시간이 없고, 아직 팝업을 보여주지 않았다면 팝업 표시
        // 단, 근로소득, 사업소득자만 해당
        if (!hasShownOvertimePopup && (employmentType === '근로소득' || employmentType === '사업소득')) {
          setPendingOvertimeCalculation({
            employeeId: employeeId,
            currentWeekStart: currentWeekStart,
            actualWorkHours: actualWorkHours
          });
          setShowOvertimePopup(true);
          setHasShownOvertimePopup(true);
          return 0; // 팝업에서 입력받을 때까지 대기
        }
      }
      
      // 연장근무시간 계산: 전주 누적 + max(0, 실근무시간 - 주간근무시간)
      const currentWeekOvertime = Math.max(0, actualWorkHours - weeklyWorkHours);
      const newAccumulatedOvertime = previousOvertime + currentWeekOvertime;
      
      console.log('전주 누적 연장근무:', previousOvertime, '이번주 연장근무:', currentWeekOvertime, '새 누적:', newAccumulatedOvertime);
      
      // 이번주 연장근무시간 기록 저장
      const overtimeRecord = {
        employeeId: employeeId,
        weekStart: currentWeekStart,
        actualWorkHours: actualWorkHours,
        weeklyWorkHours: weeklyWorkHours,
        currentWeekOvertime: currentWeekOvertime,
        accumulatedOvertime: newAccumulatedOvertime,
        createdAt: new Date()
      };
      
      // 기존 기록이 있으면 업데이트, 없으면 새로 생성
      if (!overtimeSnapshot.empty) {
        await updateDoc(overtimeSnapshot.docs[0].ref, overtimeRecord);
      } else {
        await addDoc(collection(db, 'overtimeRecords'), overtimeRecord);
      }
      
      return newAccumulatedOvertime;
    } catch (error) {
      console.error('연장근무시간 계산 실패:', error);
      return 0;
    }
  };

  // 팝업에서 전월 이월 연장근무시간을 입력받은 후 계산을 완료하는 함수
  const completeOvertimeCalculation = async (inputOvertime: number) => {
    if (!pendingOvertimeCalculation) return;
    
    try {
      const { employeeId, currentWeekStart, actualWorkHours } = pendingOvertimeCalculation;
      
      // 직원 정보에서 주간 근무시간 가져오기
      const employeeQuery = query(
        collection(db, 'employees'),
        where('__name__', '==', employeeId)
      );
      const employeeSnapshot = await getDocs(employeeQuery);
      
      if (employeeSnapshot.empty) {
        console.log('직원 정보를 찾을 수 없습니다:', employeeId);
        return;
      }
      
      const employeeData = employeeSnapshot.docs[0].data();
      const weeklyWorkHours = employeeData.weeklyWorkHours || 40;
      
      // 연장근무시간 계산: 입력받은 전월 이월 + max(0, 실근무시간 - 주간근무시간)
      const currentWeekOvertime = Math.max(0, actualWorkHours - weeklyWorkHours);
      const newAccumulatedOvertime = inputOvertime + currentWeekOvertime;
      
      // 이번주 연장근무시간 기록 저장
      const overtimeRecord = {
        employeeId: employeeId,
        weekStart: currentWeekStart,
        actualWorkHours: actualWorkHours,
        weeklyWorkHours: weeklyWorkHours,
        currentWeekOvertime: currentWeekOvertime,
        accumulatedOvertime: newAccumulatedOvertime,
        createdAt: new Date()
      };
      
      await addDoc(collection(db, 'overtimeRecords'), overtimeRecord);
      
      console.log('전월 이월 연장근무시간 입력 완료:', inputOvertime, '새 누적:', newAccumulatedOvertime);
      
      // 팝업 상태 초기화
      setShowOvertimePopup(false);
      setOvertimeInput('');
      setPendingOvertimeCalculation(null);
      
    } catch (error) {
      console.error('연장근무시간 계산 완료 실패:', error);
    }
  };

  // 기존 비교 데이터를 불러오는 함수
  const loadExistingComparisonData = async () => {
    if (!selectedEmployeeId || !selectedMonth) {
      setComparisonResults([]);
      return;
    }
    
    try {
      console.log('기존 비교 데이터 로드 시작:', selectedEmployeeId, selectedMonth);
      
      const querySnapshot = await getDocs(
        query(
          collection(db, 'actualWorkRecords'),
          where('employeeId', '==', selectedEmployeeId),
          where('month', '==', selectedMonth),
          where('branchId', '==', selectedBranchId)
        )
      );
      
      console.log('DB 쿼리 결과:', querySnapshot.docs.length, '건');
      console.log('현재 employeeReviewStatus:', employeeReviewStatus);
      
      if (!querySnapshot.empty) {
        const existingData = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            employeeName: data.employeeName,
            date: data.date,
            scheduledHours: data.scheduledHours || 0,
            actualHours: data.actualHours,
            difference: data.difference,
            status: data.status,
            scheduledTimeRange: data.scheduledTimeRange || '-',
            actualTimeRange: data.actualTimeRange || '-',
            isModified: data.isModified || false,
            breakTime: data.breakTime || 0,
            actualWorkHours: data.actualWorkHours || 0
          };
        });
        
        // 날짜순으로 정렬
        existingData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setComparisonResults(existingData);
        console.log('기존 비교 데이터 로드됨:', existingData);
        
        // 기존 데이터가 있으면 해당 직원을 검토중으로 상태 변경 (단, 이미 검토완료가 아닌 경우에만)
        if (existingData.length > 0) {
          const currentStatus = employeeReviewStatus.find(status => status.employeeId === selectedEmployeeId)?.status;
          console.log('기존 데이터 발견, 현재 상태:', currentStatus, '직원:', selectedEmployeeId);
          
          // 이미 검토완료 상태가 아닌 경우에만 검토중으로 변경
          if (currentStatus !== '검토완료') {
            console.log('검토중 상태로 변경:', selectedEmployeeId);
            setEmployeeReviewStatus(prev => {
              const updated = prev.map(status => 
                status.employeeId === selectedEmployeeId 
                  ? { ...status, status: '검토중' as '검토전' | '검토중' | '검토완료' }
                  : status
              );
              console.log('검토 상태 업데이트:', updated);
              return updated;
            });
          } else {
            console.log('이미 검토완료 상태이므로 상태 변경하지 않음:', selectedEmployeeId);
          }
        }
      } else {
        // 기존 데이터가 없으면 비교 결과 초기화
        setComparisonResults([]);
        console.log('기존 비교 데이터 없음, 초기화됨');
      }
    } catch (error) {
      console.error('기존 비교 데이터 로드 실패:', error);
      setComparisonResults([]);
    }
  };

  // 모든 비교 결과를 DB에 저장하는 함수
  const saveAllComparisonResults = async (results: WorkTimeComparison[]) => {
    if (!selectedEmployeeId || !selectedMonth) {
      console.log('저장 실패: 직원ID 또는 월이 없음');
      return;
    }
    
    try {
      console.log('DB 저장 시작:', selectedEmployeeId, selectedMonth, results.length, '건');
      
      // 기존 데이터 삭제
      const existingQuery = query(
        collection(db, 'actualWorkRecords'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth)
      );
      
      const existingSnapshot = await getDocs(existingQuery);
      console.log('기존 데이터 삭제:', existingSnapshot.docs.length, '건');
      
      const deletePromises = existingSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // 새로운 데이터 저장
      const savePromises = results.map(result => {
        const actualWorkRecord = {
          employeeId: selectedEmployeeId,
          employeeName: result.employeeName,
          date: result.date,
          month: selectedMonth,
          scheduledHours: result.scheduledHours,
          actualHours: result.actualHours,
          difference: result.difference,
          status: result.status,
          scheduledTimeRange: result.scheduledTimeRange,
          actualTimeRange: result.actualTimeRange,
          isModified: result.isModified,
          breakTime: result.breakTime || 0,
          actualWorkHours: result.actualWorkHours || 0,
          createdAt: new Date()
        };
        
        return addDoc(collection(db, 'actualWorkRecords'), actualWorkRecord);
      });
      
      await Promise.all(savePromises);
      console.log('모든 비교 결과가 DB에 저장되었습니다:', results.length, '건');
    } catch (error) {
      console.error('비교 결과 저장 실패:', error);
    }
  };

  // 수정된 데이터를 DB에 저장
  const saveModifiedData = async (result: WorkTimeComparison) => {
    try {
      const actualWorkRecord = {
        employeeId: selectedEmployeeId,
        employeeName: result.employeeName,
        date: result.date,
        actualHours: result.actualHours,
        actualWorkHours: result.actualWorkHours,
        breakTime: result.breakTime,
        scheduledHours: result.scheduledHours,
        difference: result.difference,
        status: result.status,
        isModified: true,
        modifiedAt: new Date(),
        branchId: selectedBranchId,
        month: selectedMonth,
        scheduledTimeRange: result.scheduledTimeRange,
        actualTimeRange: result.actualTimeRange
      };

      // 기존 데이터가 있는지 확인 (더 정확한 중복 확인)
      const existingQuery = query(
        collection(db, 'actualWorkRecords'),
        where('employeeId', '==', selectedEmployeeId),
        where('date', '==', result.date),
        where('month', '==', selectedMonth)
      );
      
      const existingDocs = await getDocs(existingQuery);
      
      if (existingDocs.empty) {
        // 새로 추가
        await addDoc(collection(db, 'actualWorkRecords'), actualWorkRecord);
        console.log('새로운 실제근무 데이터 저장됨:', actualWorkRecord);
      } else {
        // 기존 데이터가 여러 개인 경우 첫 번째 것만 업데이트하고 나머지는 삭제
        if (existingDocs.docs.length > 1) {
          console.log(`중복 데이터 발견: ${existingDocs.docs.length}개, 첫 번째 것만 유지하고 나머지 삭제`);
          
          // 첫 번째 문서는 업데이트
          const firstDocId = existingDocs.docs[0].id;
          await updateDoc(doc(db, 'actualWorkRecords', firstDocId), actualWorkRecord);
          console.log('첫 번째 실제근무 데이터 업데이트됨:', actualWorkRecord);
          
          // 나머지 문서들은 삭제
          for (let i = 1; i < existingDocs.docs.length; i++) {
            await deleteDoc(doc(db, 'actualWorkRecords', existingDocs.docs[i].id));
            console.log(`중복 데이터 삭제됨: ${existingDocs.docs[i].id}`);
          }
        } else {
          // 기존 데이터 업데이트
          const docId = existingDocs.docs[0].id;
          await updateDoc(doc(db, 'actualWorkRecords', docId), actualWorkRecord);
          console.log('기존 실제근무 데이터 업데이트됨:', actualWorkRecord);
        }
      }
      
    } catch (error) {
      console.error('데이터 저장 실패:', error);
      alert('데이터 저장에 실패했습니다.');
    }
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">근무시간 비교</h3>
        <p className="text-sm text-gray-600 mt-1">매월 초 한번씩 전달의 스케쥴과 실제근무 시간을 비교합니다</p>
      </div>
      
      <div className="p-6">
        <div className="mb-6">
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800 mb-2">메뉴 설명</h3>
              <div className="text-sm text-blue-700 space-y-1">
                <p>• 매월 초 한번씩 전달의 스케쥴과 실제근무 시간을 비교합니다</p>
                <p>• 비교할 월을 선택하고 실제근무 데이터를 복사붙여넣기합니다</p>
                <p>• 차이가 있는 경우 초과/부족 시간을 확인하고, 수정할 수 있습니다</p>
              </div>
              
              <h3 className="text-sm font-medium text-blue-800 mt-4 mb-2">사용 방법</h3>
              <div className="text-sm text-blue-700 space-y-1">
                <p>1. 지점, 비교할 월 선택 후, 직원 선택</p>
                <p>2. POS에서 실제 근무 데이터 붙여넣기</p>
                <p>3. 근무시간 비교 버튼 클릭해서 차이나는 시간을 조정</p>
                <p>4. 모든 스케쥴 수정/확인 완료 시 검토완료 상태로 변경</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 필터 선택 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* 지점 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            지점 선택 <span className="text-red-500">*</span>
          </label>
          {isManager ? (
            <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm text-gray-700">
              {userBranch?.name || '지점 정보 없음'}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => {
                    setSelectedBranchId(branch.id);
                    setSelectedEmployeeId(''); // 지점 변경 시 직원 선택 초기화
                  }}
                  className={`px-3 py-2 rounded-md font-medium text-sm transition-colors ${
                    selectedBranchId === branch.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {branch.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 월 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            월 선택 <span className="text-red-500">*</span>
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              loadSchedules(e.target.value);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>


      </div>

      {/* 직원 리스트 테이블 */}
      {selectedBranchId && selectedMonth && employees.length > 0 ? (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            선택된 지점의 직원 목록
          </h3>
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      선택
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      직원명
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      고용형태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      검토여부
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {employees.map((employee) => {
                    const hasContractInfo = employee.employmentType && employee.salaryType;
                    return (
                      <tr 
                        key={employee.id} 
                        className={`${
                          hasContractInfo 
                            ? `hover:bg-gray-50 cursor-pointer ${selectedEmployeeId === employee.id ? 'bg-blue-50' : ''}`
                            : 'bg-gray-100 cursor-not-allowed opacity-60'
                        }`}
                        onClick={() => {
                          if (hasContractInfo) {
                            setSelectedEmployeeId(employee.id);
                          } else {
                            alert('근로계약 정보가 없습니다.\n직원관리 > 근로계약관리에서 계약정보를 입력해주세요.');
                          }
                        }}
                      >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <input
                          type="radio"
                          name="employee"
                          value={employee.id}
                          checked={selectedEmployeeId === employee.id}
                          onChange={() => {
                            console.log('직원 선택 시도:', employee.name, 'hasContractInfo:', hasContractInfo, 'employmentType:', employee.employmentType, 'salaryType:', employee.salaryType);
                            if (hasContractInfo) {
                              console.log('직원 선택됨:', employee.id);
                              setSelectedEmployeeId(employee.id);
                            } else {
                              console.log('근로계약 정보 없음으로 선택 불가');
                            }
                          }}
                          disabled={!hasContractInfo}
                          className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 ${
                            !hasContractInfo ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <div className="flex items-center space-x-2">
                          <span>{employee.name}</span>
                          {!hasContractInfo && (
                            <span 
                              className="text-red-500 text-xs"
                              title="근로계약정보 입력 필요"
                            >
                              ⚠️
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {(() => {
                          if (employee.employmentType && employee.salaryType) {
                            const salaryTypeText = employee.salaryType === 'hourly' ? '시급' : '월급';
                            return `${employee.employmentType}(${salaryTypeText})`;
                          } else if (employee.employmentType) {
                            return employee.employmentType;
                          } else {
                            return '-';
                          }
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {(() => {
                          // 근로계약 히스토리가 없는 경우
                          if (!employee.employmentType || !employee.salaryType) {
                            return (
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full text-red-600 bg-red-50">
                                근로계약 정보 필요
                              </span>
                            );
                          }
                          
                          const empStatus = employeeReviewStatus.find(status => status.employeeId === employee.id)?.status || '검토전';
                          const getStatusColor = (status: string) => {
                            switch (status) {
                              case '검토전': return 'text-gray-600 bg-gray-50';
                              case '검토중': return 'text-orange-600 bg-orange-50';
                              case '검토완료': return 'text-green-600 bg-green-50';
                              default: return 'text-gray-600 bg-gray-50';
                            }
                          };
                          return (
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(empStatus)}`}>
                              {empStatus}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      ) : null}

      {/* 실제근무 데이터 입력 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          실제근무 데이터 (복사붙여넣기) <span className="text-red-500">*</span>
        </label>
        
        {/* 도움말 */}
        <div className="mb-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-900 mb-2">데이터 복사 방법</h4>
              <div className="text-sm text-blue-800 space-y-2">
                <p><strong>POS ASP 시스템에서 복사하기:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>POS ASP 시스템 → 기타관리 → 근태관리 → 월근태내역</li>
                  <li>조회일자 설정 후 &quot;조회&quot; 버튼 클릭</li>
                  <li>아래 표에서 해당 직원의 <strong>전체 데이터 영역을 선택</strong>하여 복사</li>
                  <li>복사한 데이터를 아래 텍스트 영역에 붙여넣기</li>
                </ol>
                <div className="mt-3 p-2 bg-white border border-blue-300 rounded text-xs">
                  <p className="font-medium text-gray-700">복사 예시:</p>
                  <p className="text-gray-600 font-mono">2025-09-11	2025-09-11 19:00:10	2025-09-11 22:11:05	2025-09-11	...	3:11</p>
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        const modal = document.createElement('div');
                        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
                        modal.innerHTML = `
                          <div class="bg-white p-4 rounded-lg max-w-6xl max-h-[90vh] overflow-auto">
                            <div class="flex justify-between items-center mb-4">
                              <h3 class="text-lg font-semibold">POS ASP 시스템 화면 예시</h3>
                              <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
                            </div>
                            <div class="text-sm text-gray-600 mb-4">
                              <p><strong>복사할 영역:</strong> 아래 표에서 해당 직원의 전체 데이터 행을 선택하여 복사하세요.</p>
                              <p><strong>주의:</strong> 표 헤더는 제외하고 데이터 행만 복사해야 합니다.</p>
                            </div>
                            <div class="bg-gray-100 p-4 rounded border">
                              <p class="text-xs text-gray-500 mb-2">POS ASP 시스템 → 기타관리 → 근태관리 → 월근태내역 화면</p>
                              <div class="bg-white border rounded p-3">
                                <img 
                                  src="/images/pos-asp-example.png" 
                                  alt="POS ASP 시스템 화면 예시" 
                                  class="w-full h-auto border rounded"
                                  onerror="console.log('이미지 로드 실패:', this); this.style.display='none';"
                                />
                              </div>
                              <div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                                <p class="font-medium text-yellow-800 mb-2">💡 복사 방법:</p>
                                <ul class="text-yellow-700 space-y-1">
                                  <li>• 위 표에서 해당 직원의 데이터 행들을 마우스로 드래그하여 선택한 후 Ctrl+C로 복사하세요.</li>
                                  <li>• 헤더는 제외하고 데이터 행만 복사</li>
                                  <li>• 여러 날의 데이터가 있는 경우 모든 행을 포함</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        `;
                        document.body.appendChild(modal);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-xs underline"
                    >
                      📷 POS ASP 화면 예시 보기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <textarea
          value={actualWorkData}
          onChange={(e) => setActualWorkData(e.target.value)}
          placeholder="POS ASP 시스템에서 복사한 실제근무 데이터를 붙여넣으세요..."
          className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 비교 실행 버튼 */}
      <div className="mb-6">
        <button
          onClick={compareWorkTimes}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {loading ? '로딩 중...' : '근무시간 비교'}
        </button>
      </div>

      {/* 비교 결과 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            비교 결과 {comparisonResults.length > 0 ? `(${comparisonResults.length}건)` : ''}
          </h3>
        </div>
        
        {comparisonResults.length > 0 && (
          <div>
            {/* 검토완료 버튼 */}
            <div className="mb-4 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {(() => {
                  const completedCount = comparisonResults.filter(result => 
                    result.status === 'review_completed' || result.status === 'time_match'
                  ).length;
                  const totalCount = comparisonResults.length;
                  return `${completedCount}/${totalCount} 항목 확인완료`;
                })()}
              </div>
              <button
                onClick={async () => {
                  const allCompleted = comparisonResults.every(result => 
                    result.status === 'review_completed' || result.status === 'time_match'
                  );
                  
                  if (allCompleted) {
                    if (confirm('모든 항목이 확인완료되었습니다. 검토완료 상태로 변경하시겠습니까?')) {
                      setEmployeeReviewStatus(prev => {
                        const existingIndex = prev.findIndex(status => status.employeeId === selectedEmployeeId);
                        
                        if (existingIndex >= 0) {
                          // 기존 상태 업데이트
                          const updated = [...prev];
                          updated[existingIndex] = { ...updated[existingIndex], status: '검토완료' as '검토전' | '검토중' | '검토완료' };
                          console.log('검토완료 상태 업데이트:', updated);
                          return updated;
                        } else {
                          // 새로운 상태 추가
                          const newStatus = { employeeId: selectedEmployeeId, status: '검토완료' as '검토전' | '검토중' | '검토완료' };
                          const updated = [...prev, newStatus];
                          console.log('검토완료 상태 추가:', updated);
                          return updated;
                        }
                      });
                      await saveReviewStatus(selectedEmployeeId, '검토완료');
                    }
                  } else {
                    alert('모든 항목을 확인완료한 후 검토완료 상태로 변경할 수 있습니다.');
                  }
                }}
                disabled={!comparisonResults.every(result => 
                  result.status === 'review_completed' || result.status === 'time_match'
                ) || isPayrollConfirmed(selectedEmployeeId)}
                className={`px-4 py-2 rounded-md font-medium text-sm ${
                  comparisonResults.every(result => 
                    result.status === 'review_completed' || result.status === 'time_match'
                  ) && !isPayrollConfirmed(selectedEmployeeId)
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isPayrollConfirmed(selectedEmployeeId) ? '급여확정완료' : '검토완료'}
              </button>
            </div>
            
            <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    직원명
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    날짜
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    스케줄 시간
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    실제 시간
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    휴게시간
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    실근무시간
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    차이
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    연장근무시간
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {comparisonResults.map((result, index) => {
                  const rowBgColor = (result.status === 'review_completed' || result.status === 'time_match') 
                    ? 'bg-white' 
                    : 'bg-yellow-50';
                  
                  return (
                    <tr key={index} className={`hover:bg-gray-50 ${rowBgColor} border-t border-gray-200`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {result.employeeName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {result.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        <div>{(() => {
                          const hours = Math.floor(result.scheduledHours);
                          const minutes = Math.round((result.scheduledHours - hours) * 60);
                          return `${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}</div>
                        <div className="text-xs text-gray-500">{result.scheduledTimeRange}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        <div>{(() => {
                          const hours = Math.floor(result.actualHours);
                          const minutes = Math.round((result.actualHours - hours) * 60);
                          return `${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}</div>
                        <div className="text-xs text-gray-500">{result.actualTimeRange}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {(() => {
                          const breakTime = result.breakTime || 0;
                          const hours = Math.floor(breakTime);
                          const minutes = Math.round((breakTime - hours) * 60);
                          return `${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {result.status === 'review_completed' || isPayrollConfirmed(selectedEmployeeId) ? (
                          // 확인완료 상태이거나 급여확정된 경우 수정 불가
                          <span className="text-gray-600">
                            {(() => {
                              const actualWorkHours = result.actualWorkHours || 0;
                              const hours = Math.floor(actualWorkHours);
                              const minutes = Math.round((actualWorkHours - hours) * 60);
                              return `${hours}:${minutes.toString().padStart(2, '0')}`;
                            })()}
                          </span>
                        ) : (
                          // 미확인 상태에서는 클릭해서 편집 가능
                          <input
                            type="text"
                            value={(() => {
                              const actualWorkHours = result.actualWorkHours || 0;
                              const hours = Math.floor(actualWorkHours);
                              const minutes = Math.round((actualWorkHours - hours) * 60);
                              return `${hours}:${minutes.toString().padStart(2, '0')}`;
                            })()}
                            onChange={async (e) => {
                              const newTimeStr = e.target.value;
                              let newHours = 0;
                              
                              if (newTimeStr.includes(':')) {
                                const parts = newTimeStr.split(':');
                                const hours = parseInt(parts[0]) || 0;
                                const minutes = parseInt(parts[1]) || 0;
                                newHours = hours + (minutes / 60);
                              } else {
                                const numericValue = parseFloat(newTimeStr) || 0;
                                newHours = numericValue;
                              }
                              
                              const updatedResults = [...comparisonResults];
                              const updatedResult = {
                                ...result,
                                actualWorkHours: newHours,
                                actualHours: newHours + (result.breakTime || 0), // 실제근무시간 = 실근무시간 + 휴게시간
                                difference: newHours - result.scheduledHours,
                                isModified: true
                              };
                              updatedResults[index] = updatedResult;
                              setComparisonResults(sortComparisonResults(updatedResults));
                              
                              // DB에 저장
                              await saveModifiedData(updatedResult);
                            }}
                            className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0:00"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {(() => {
                          const absDifference = Math.abs(result.difference);
                          const hours = Math.floor(absDifference);
                          const minutes = Math.round((absDifference - hours) * 60);
                          const sign = result.difference > 0 ? '+' : result.difference < 0 ? '-' : '';
                          return `${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(result.status)}`}>
                          {getStatusText(result.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {/* 연장근무시간은 정직원만 표시 */}
                        {(() => {
                          // 정직원인지 확인 (실제로는 직원 정보를 확인해야 함)
                          const isRegularEmployee = true; // 임시로 true, 실제로는 직원 타입 확인
                          if (!isRegularEmployee) return '-';
                          
                          // 연장근무시간 계산 (실제 근무시간 - 주간 근무시간)
                          const weeklyWorkHours = 40; // 기본값, 실제로는 직원 정보에서 가져와야 함
                          const overtimeHours = Math.max(0, result.actualHours - weeklyWorkHours);
                          
                          if (overtimeHours === 0) return '0:00';
                          
                          const hours = Math.floor(overtimeHours);
                          const minutes = Math.round((overtimeHours - hours) * 60);
                          return `${hours}:${minutes.toString().padStart(2, '0')}`;
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {(result.status === 'review_required' || result.status === 'review_completed') && !isPayrollConfirmed(selectedEmployeeId) && !(employeeReviewStatus.find(status => status.employeeId === selectedEmployeeId)?.status === '검토완료') && (
                          <div className="flex space-x-2">
                            {result.status === 'review_required' ? (
                              // 미확인 상태: 확인 버튼
                              <button
                                onClick={async () => {
                                  const updatedResults = [...comparisonResults];
                                  updatedResults[index] = {
                                    ...result,
                                    status: 'review_completed',
                                    isModified: true
                                  };
                                  setComparisonResults(sortComparisonResults(updatedResults));
                                  
                                  setEmployeeReviewStatus(prev => {
                                    const existingIndex = prev.findIndex(status => status.employeeId === selectedEmployeeId);
                                    
                                    if (existingIndex >= 0) {
                                      // 기존 상태 업데이트
                                      const updated = [...prev];
                                      updated[existingIndex] = { ...updated[existingIndex], status: '검토중' as '검토전' | '검토중' | '검토완료' };
                                      return updated;
                                    } else {
                                      // 새로운 상태 추가
                                      const newStatus = { employeeId: selectedEmployeeId, status: '검토중' as '검토전' | '검토중' | '검토완료' };
                                      return [...prev, newStatus];
                                    }
                                  });
                                  
                                  // DB에 저장
                                  await saveModifiedData(updatedResults[index]);
                                  await saveReviewStatus(selectedEmployeeId, '검토중');
                                }}
                                className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                              >
                                확인
                              </button>
                            ) : (
                              // 확인완료 상태: 확인취소 버튼
                              <button
                                onClick={async () => {
                                  const updatedResults = [...comparisonResults];
                                  updatedResults[index] = {
                                    ...result,
                                    status: 'review_required',
                                    isModified: true
                                  };
                                  setComparisonResults(sortComparisonResults(updatedResults));
                                  
                                  setEmployeeReviewStatus(prev => {
                                    const existingIndex = prev.findIndex(status => status.employeeId === selectedEmployeeId);
                                    
                                    if (existingIndex >= 0) {
                                      // 기존 상태 업데이트
                                      const updated = [...prev];
                                      updated[existingIndex] = { ...updated[existingIndex], status: '검토중' as '검토전' | '검토중' | '검토완료' };
                                      return updated;
                                    } else {
                                      // 새로운 상태 추가
                                      const newStatus = { employeeId: selectedEmployeeId, status: '검토중' as '검토전' | '검토중' | '검토완료' };
                                      return [...prev, newStatus];
                                    }
                                  });
                                  
                                  // DB에 저장
                                  await saveModifiedData(updatedResults[index]);
                                  await saveReviewStatus(selectedEmployeeId, '검토중');
                                }}
                                className="bg-orange-600 text-white px-3 py-1 rounded text-xs hover:bg-orange-700"
                              >
                                확인취소
                              </button>
                            )}
                            {result.status === 'review_required' && (
                              <button
                                onClick={async () => {
                                  if (confirm('스케줄 시간을 실제 근무시간으로 복사하시겠습니까?')) {
                                    const updatedResults = [...comparisonResults];
                                    const breakTime = result.breakTime || 0;
                                    const actualWorkHours = Math.max(0, result.scheduledHours - breakTime);
                                    
                                    updatedResults[index] = {
                                      ...result,
                                      actualHours: result.scheduledHours,
                                      actualWorkHours: actualWorkHours,
                                      difference: 0, // 스케줄과 동일하므로 차이 0
                                      status: 'review_completed',
                                      isModified: true,
                                      actualTimeRange: result.scheduledTimeRange
                                    };
                                    setComparisonResults(sortComparisonResults(updatedResults));
                                    
                                    setEmployeeReviewStatus(prev => {
                                      const existingIndex = prev.findIndex(status => status.employeeId === selectedEmployeeId);
                                      
                                      if (existingIndex >= 0) {
                                        // 기존 상태 업데이트
                                        const updated = [...prev];
                                        updated[existingIndex] = { ...updated[existingIndex], status: '검토중' as '검토전' | '검토중' | '검토완료' };
                                        return updated;
                                      } else {
                                        // 새로운 상태 추가
                                        const newStatus = { employeeId: selectedEmployeeId, status: '검토중' as '검토전' | '검토중' | '검토완료' };
                                        return [...prev, newStatus];
                                      }
                                    });
                                    
                                    // DB에 저장
                                    await saveModifiedData(updatedResults[index]);
                                    await saveReviewStatus(selectedEmployeeId, '검토중');
                                  }
                                }}
                                className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                              >
                                스케줄시간복사
                              </button>
                            )}
                          </div>
                        )}
                        
                        {/* 급여확정된 경우 안내 메시지 */}
                        {isPayrollConfirmed(selectedEmployeeId) && (
                          <span className="text-red-600 text-xs font-medium">
                            급여확정완료
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr className="font-semibold">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center" colSpan={2}>
                    합계
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      const totalScheduled = comparisonResults.reduce((sum, result) => sum + result.scheduledHours, 0);
                      const hours = Math.floor(totalScheduled);
                      const minutes = Math.round((totalScheduled - hours) * 60);
                      return `${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      const totalActual = comparisonResults.reduce((sum, result) => sum + result.actualHours, 0);
                      const hours = Math.floor(totalActual);
                      const minutes = Math.round((totalActual - hours) * 60);
                      return `${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      const totalBreak = comparisonResults.reduce((sum, result) => sum + (result.breakTime || 0), 0);
                      const hours = Math.floor(totalBreak);
                      const minutes = Math.round((totalBreak - hours) * 60);
                      return `${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      const totalActualWork = comparisonResults.reduce((sum, result) => sum + (result.actualWorkHours || 0), 0);
                      const hours = Math.floor(totalActualWork);
                      const minutes = Math.round((totalActualWork - hours) * 60);
                      return `${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      const totalDifference = comparisonResults.reduce((sum, result) => sum + result.difference, 0);
                      const absDifference = Math.abs(totalDifference);
                      const hours = Math.floor(absDifference);
                      const minutes = Math.round((absDifference - hours) * 60);
                      const sign = totalDifference > 0 ? '+' : totalDifference < 0 ? '-' : '';
                      return `${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                      -
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      const totalOvertime = comparisonResults.reduce((sum, result) => {
                        const weeklyWorkHours = 40; // 기본값, 실제로는 직원 정보에서 가져와야 함
                        return sum + Math.max(0, result.actualHours - weeklyWorkHours);
                      }, 0);
                      
                      if (totalOvertime === 0) return '0:00';
                      
                      const hours = Math.floor(totalOvertime);
                      const minutes = Math.round((totalOvertime - hours) * 60);
                      return `${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {/* 합계 행에는 작업 버튼 없음 */}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          {/* 급여메모 편집 */}
          {selectedEmployeeId && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 text-sm">📝</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">급여메모 (자동저장)</h4>
                  <textarea
                    value={employeeMemos[selectedEmployeeId] || ''}
                    onChange={(e) => {
                      const memo = e.target.value;
                      setEmployeeMemos(prev => ({
                        ...prev,
                        [selectedEmployeeId]: memo
                      }));
                    }}
                    onBlur={(e) => {
                      // 포커스를 잃을 때 저장 (한글 입력 완료 후)
                      const memo = e.target.value;
                      saveEmployeeMemo(selectedEmployeeId, memo);
                    }}
                    placeholder="이번 달 급여에 대한 특이사항이나 메모를 입력하세요..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}
          </div>
        )}

        {comparisonResults.length === 0 && (
          <div className="px-6 py-12 text-center">
            <div className="text-gray-500 text-lg mb-2">📊</div>
            <div className="text-gray-500 text-lg mb-2">비교결과 데이터 없음</div>
            <div className="text-gray-400 text-sm">
              지점, 월, 직원을 선택하고 실제근무 데이터를 입력한 후<br />
              &quot;근무시간 비교&quot; 버튼을 클릭해주세요.
            </div>
          </div>
        )}
      </div>

      {/* 요약 통계 */}
      {comparisonResults.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {comparisonResults.filter(r => r.status === 'time_match').length}
            </div>
            <div className="text-sm text-green-600">시간일치</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {comparisonResults.filter(r => r.status === 'review_required').length}
            </div>
            <div className="text-sm text-orange-600">확인필요</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {comparisonResults.filter(r => r.status === 'review_completed').length}
            </div>
            <div className="text-sm text-purple-600">확인완료</div>
          </div>
        </div>
      )}

      {/* 전월 이월 연장근무시간 입력 팝업 */}
      {showOvertimePopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              전월 이월 연장근무시간 입력
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              최초 연장근무시간 계산을 위해 전월 이월 연장근무시간을 입력해주세요.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                전월 이월 연장근무시간 (시간)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={overtimeInput}
                onChange={(e) => setOvertimeInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="예: 5.5"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowOvertimePopup(false);
                  setOvertimeInput('');
                  setPendingOvertimeCalculation(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const inputValue = parseFloat(overtimeInput);
                  if (!isNaN(inputValue) && inputValue >= 0) {
                    completeOvertimeCalculation(inputValue);
                  }
                }}
                disabled={!overtimeInput || isNaN(parseFloat(overtimeInput)) || parseFloat(overtimeInput) < 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
