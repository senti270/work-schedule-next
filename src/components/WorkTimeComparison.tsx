'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc, orderBy, limit, getDoc } from 'firebase/firestore';
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
  isNewFormat?: boolean; // 새로운 형식인지 여부 (휴게시간 이미 차감됨)
  posTimeRange?: string; // POS 원본 시간 범위 (예: "10:02-22:32")
}

interface WorkTimeComparison {
  employeeName: string;
  date: string;
  scheduledHours: number;
  actualHours: number;
  difference: number;
  status: 'time_match' | 'review_required' | 'review_completed';
  scheduledTimeRange?: string; // "19:00-22:00" 형태
  actualTimeRange?: string; // "19:00-22:11" 형태 (편집 가능)
  isModified?: boolean; // 수정 여부
  // 휴게시간 및 실근무시간
  breakTime?: number; // 휴게시간 (시간) - 기존 필드
  actualBreakTime?: number; // 실휴게시간 (시간) - 신규 필드 (편집 가능)
  actualWorkHours?: number; // 실근무시간 (actualTimeRange시간 - actualBreakTime)
  posTimeRange?: string; // POS 원본 시간 범위 - 신규 필드
}

interface WorkTimeComparisonProps {
  userBranch?: {
    id: string;
    name: string;
    managerEmail?: string;
  } | null;
  isManager?: boolean;
  selectedEmployeeId?: string;
  selectedMonth?: string;
  selectedBranchId?: string;
  hideEmployeeSelection?: boolean;
  hideBranchSelection?: boolean;
  selectedEmployeeBranches?: string[]; // 선택된 직원의 지점 목록
  onStatusChange?: () => void; // 상태 변경 시 호출되는 콜백
}

export default function WorkTimeComparison({ 
  userBranch, 
  isManager, 
  selectedEmployeeId: propSelectedEmployeeId,
  selectedMonth: propSelectedMonth,
  selectedBranchId: propSelectedBranchId,
  hideEmployeeSelection = false,
  hideBranchSelection = false,
  selectedEmployeeBranches: propSelectedEmployeeBranches = [],
}: WorkTimeComparisonProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [actualWorkData, setActualWorkData] = useState<string>('');
  const [comparisonResults, setComparisonResults] = useState<WorkTimeComparison[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(propSelectedMonth || '');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(propSelectedBranchId || '');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(propSelectedEmployeeId || '');
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
  const [employeeReviewStatus, setEmployeeReviewStatus] = useState<{employeeId: string, branchId: string, status: '검토전' | '검토중' | '근무시간검토완료' | '급여확정완료'}[]>([]);
  const [payrollConfirmedEmployees] = useState<string[]>([]);
  const [employeeMemos, setEmployeeMemos] = useState<{[employeeId: string]: {admin: string, employee: string}}>({});
  
  // 전월 이월 연장근무시간 입력 팝업 상태
  const [showOvertimePopup, setShowOvertimePopup] = useState(false);
  const [overtimeInput, setOvertimeInput] = useState('');
  const [pendingOvertimeCalculation, setPendingOvertimeCalculation] = useState<{
    employeeId: string;
    currentWeekStart: Date;
    actualWorkHours: number;
  } | null>(null);
  const [hasShownOvertimePopup, setHasShownOvertimePopup] = useState(false); // 팝업 표시 여부 추적
  const [showMenuDescription, setShowMenuDescription] = useState(false); // 메뉴 설명 펼침 여부
  const [showDataCopyMethod, setShowDataCopyMethod] = useState(false); // 데이터 복사 방법 펼침 여부
  const [employeeBranches, setEmployeeBranches] = useState<string[]>([]); // 선택된 직원의 지점 목록

  // 🔥 최적화: 컴포넌트 마운트 시 초기 설정
  useEffect(() => {
    loadBranches();
    // 현재 월을 기본값으로 설정 (props가 없을 때만)
    if (!propSelectedMonth) {
      const now = new Date();
      setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
    
    // 매니저인 경우 해당 지점을 기본값으로 설정 (props가 없을 때만)
    if (isManager && userBranch && !propSelectedBranchId) {
      setSelectedBranchId(userBranch.id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // 🔥 최적화: 월 변경 시에만 직원 로드 (지점 무관)
  useEffect(() => {
    if (selectedMonth) {
      loadEmployees();
    }
  }, [selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadEmployees = useCallback(async () => {
    console.log('loadEmployees 호출됨:', { selectedBranchId, selectedMonth });
    if (!selectedMonth) {
      console.log('loadEmployees 조건 불만족:', { selectedMonth });
      return;
    }
    
    try {
      setLoading(true);
      console.log('직원 로드 시작...');
      
      // 모든 직원을 로드한 후 클라이언트에서 필터링 (인덱스 문제 완전 해결)
      console.log('Firestore 직원 컬렉션 조회 시작...');
      const employeeSnapshot = await getDocs(collection(db, 'employees'));
      console.log('Firestore 직원 컬렉션 조회 완료, 문서 수:', employeeSnapshot.docs.length);
      
      const allEmployees = employeeSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || '',
        branchId: doc.data().branchId || '',
        type: doc.data().type,
        employmentType: doc.data().employmentType,
        salaryType: doc.data().salaryType,
        branchIds: doc.data().branchIds || [],
        ...doc.data()
      }));
      
      console.log('모든 직원 데이터 매핑 완료:', allEmployees.length);
      console.log('선택된 지점 ID:', selectedBranchId);
      
      // 🔥 2025년 9월 기준: 전직원 표시를 위해 지점 필터링 제거
      const employeesData = allEmployees.filter(emp => {
        // 모든 직원을 표시 (지점 필터링 제거)
        console.log(`직원 ${emp.name} (${emp.id}) - 표시함`);
        return true;
      });
      
      console.log('필터링된 직원 수:', employeesData.length);
      
      // 이름순으로 정렬
      employeesData.sort((a, b) => a.name.localeCompare(b.name));

      console.log('로드된 직원 수:', employeesData.length);
      setEmployees(employeesData);
      
    } catch (error) {
      console.error('직원 로드 중 오류:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  // Props 변경 시 상태 업데이트
  useEffect(() => {
    if (propSelectedEmployeeId !== undefined) {
      setSelectedEmployeeId(propSelectedEmployeeId);
    }
  }, [propSelectedEmployeeId]);

  useEffect(() => {
    if (propSelectedMonth !== undefined) {
      setSelectedMonth(propSelectedMonth);
    }
  }, [propSelectedMonth]);

  useEffect(() => {
    if (propSelectedBranchId !== undefined) {
      setSelectedBranchId(propSelectedBranchId);
    }
  }, [propSelectedBranchId]);

  // 선택된 직원의 지점 정보 가져오기
  const getEmployeeBranches = useCallback(async (employeeId: string) => {
    try {
      // console.log('직원 지점 정보 조회 시작:', employeeId);
      
      // doc() 함수를 사용하여 특정 문서 ID로 직접 조회
      const employeeRef = doc(db, 'employees', employeeId);
      const employeeSnap = await getDoc(employeeRef);
      
      if (employeeSnap.exists()) {
        const employeeData = employeeSnap.data();
        // console.log('직원 데이터:', employeeData);
        const branches = employeeData.branches || [];
        // console.log('직원 지점:', branches);
        return branches;
      } else {
        console.log('직원 문서가 존재하지 않음:', employeeId);
        return [];
      }
    } catch (error) {
      console.error('직원 지점 정보 로드 실패:', error);
      return [];
    }
  }, []);

  // 선택된 직원이 변경될 때 해당 직원의 지점 정보 로드
  useEffect(() => {
    if (selectedEmployeeId && hideEmployeeSelection) {
      console.log('직원 지점 정보 로드 시작:', selectedEmployeeId);
      console.log('Props로 받은 직원 지점:', propSelectedEmployeeBranches);
      console.log('propSelectedEmployeeBranches 타입:', typeof propSelectedEmployeeBranches);
      console.log('propSelectedEmployeeBranches 길이:', propSelectedEmployeeBranches?.length);
      
      // Props로 받은 지점 정보가 있으면 사용, 없으면 DB에서 조회
      if (propSelectedEmployeeBranches && propSelectedEmployeeBranches.length > 0) {
        console.log('Props 지점 정보 사용:', propSelectedEmployeeBranches);
        setEmployeeBranches(propSelectedEmployeeBranches);
        // 지점이 1개인 경우 자동 선택, 여러 개인 경우 기존 선택 유지
        if (propSelectedEmployeeBranches.length === 1) {
          setSelectedBranchId(propSelectedEmployeeBranches[0]);
        } else if (!selectedBranchId) {
          setSelectedBranchId(propSelectedEmployeeBranches[0]);
        }
      } else {
        console.log('DB에서 지점 정보 조회');
        getEmployeeBranches(selectedEmployeeId).then(branchIds => {
          console.log('직원 지점 정보 로드 결과:', branchIds);
          setEmployeeBranches(branchIds);
          // 지점이 1개인 경우 자동 선택, 여러 개인 경우 기존 선택 유지
          if (branchIds.length === 1) {
            setSelectedBranchId(branchIds[0]);
          } else if (branchIds.length > 0 && !selectedBranchId) {
            setSelectedBranchId(branchIds[0]);
          }
        });
      }
    }
  }, [selectedEmployeeId, hideEmployeeSelection, getEmployeeBranches, selectedBranchId, propSelectedEmployeeBranches]);

  // 지점 선택이 숨겨진 경우 첫 번째 지점 자동 선택 및 비교결과 자동 로드
  useEffect(() => {
    if (hideBranchSelection && branches.length > 0 && !selectedBranchId) {
      const firstBranch = branches[0];
      setSelectedBranchId(firstBranch.id);
    }
  }, [hideBranchSelection, branches, selectedBranchId]);

  // 지점과 직원이 선택되고 비교결과가 있으면 자동으로 로드 (정의 이후로 이동)

  // 지점 필터링 최적화 (현재 사용하지 않음)
  // const filteredBranches = useMemo(() => {
  //   return branches.filter(branch => hideEmployeeSelection ? employeeBranches.includes(branch.id) : true);
  // }, [branches, hideEmployeeSelection, employeeBranches]);

  // 월이나 지점이 변경될 때 직원 목록 다시 로드
  useEffect(() => {
    if (selectedMonth && (selectedBranchId || (isManager && userBranch))) {
      loadEmployees();
    }
  }, [selectedMonth, selectedBranchId, isManager, userBranch, loadEmployees]);


  // 지점이나 직원이 변경될 때 스케줄 다시 로드
  useEffect(() => {
    if (selectedMonth) {
      loadSchedules(selectedMonth);
    }
  }, [selectedBranchId, selectedEmployeeId, selectedMonth, loadEmployees]);

  // 메모 로드 (현재 비활성화)
  // useEffect(() => {
  //   loadEmployeeMemos();
  // }, [selectedMonth, loadEmployeeMemos]);

  // 직원이 변경될 때 실제근무데이터 초기화 및 기존 데이터 로드
  useEffect(() => {
      // console.log('직원 변경 useEffect 실행:', selectedEmployeeId, selectedMonth);
    if (selectedEmployeeId) {
      // 직원이 변경되면 실제근무데이터 초기화
      setActualWorkData('');
      
      // 먼저 비교 결과 초기화 (다른 직원 데이터가 보이지 않도록)
      setComparisonResults([]);
      
      // 팝업 표시 상태 초기화 (새 직원 선택 시 팝업 다시 표시 가능)
      setHasShownOvertimePopup(false);
      
      // 기존 비교 데이터가 있는지 확인하고 로드 (현재 비활성화)
      // console.log('loadExistingComparisonData 호출 예정');
      // loadExistingComparisonData();
    } else {
      // 직원이 선택되지 않았으면 비교 결과 초기화
      setComparisonResults([]);
    }
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

  // 급여확정된 직원 목록 로드 (현재 사용하지 않음)
  // const loadPayrollConfirmedEmployees = useCallback(async () => {
  //   try {
  //     if (!selectedMonth) return;
  //     
  //     // 매니저의 경우 userBranch.id 사용, 일반 사용자의 경우 selectedBranchId 사용
  //     const branchId = isManager && userBranch ? userBranch.id : selectedBranchId;
  //     
  //     const payrollQuery = query(
  //       collection(db, 'payrollRecords'),
  //       where('month', '==', selectedMonth),
  //       where('branchId', '==', branchId)
  //     );
  //     const payrollSnapshot = await getDocs(payrollQuery);
  //     
  //     const confirmedEmployeeIds = payrollSnapshot.docs.map(doc => doc.data().employeeId);
  //     setPayrollConfirmedEmployees(confirmedEmployeeIds);
  //     console.log('급여확정된 직원 목록:', confirmedEmployeeIds);
  //   } catch (error) {
  //     console.error('급여확정 직원 목록 로드 실패:', error);
  //   }
  // }, [selectedMonth, selectedBranchId, isManager, userBranch]);


  // 직원별 급여메모 저장
  const saveEmployeeMemo = async (employeeId: string, memo: string, type: 'admin' | 'employee') => {
    try {
      const memoRecord = {
        employeeId,
        type,
        memo,
        month: selectedMonth,
        updatedAt: new Date()
      };

      // 기존 메모가 있는지 확인 (타입별로)
      const existingQuery = query(
        collection(db, 'employeeMemos'),
        where('employeeId', '==', employeeId),
        where('month', '==', selectedMonth),
        where('type', '==', type)
      );
      const existingDocs = await getDocs(existingQuery);
      
      if (existingDocs.empty) {
        // 새로 추가
        await addDoc(collection(db, 'employeeMemos'), memoRecord);
        console.log(`새로운 직원 메모 저장됨 (${type}):`, memoRecord);
      } else {
        // 기존 데이터 업데이트
        const docId = existingDocs.docs[0].id;
        await updateDoc(doc(db, 'employeeMemos', docId), memoRecord);
        console.log(`기존 직원 메모 업데이트됨 (${type}):`, memoRecord);
      }
      
      // 로컬 상태 업데이트
      setEmployeeMemos(prev => ({
        ...prev,
        [employeeId]: {
          ...prev[employeeId],
          [type]: memo
        }
      }));
      
    } catch (error) {
      console.error('직원 메모 저장 실패:', error);
    }
  };

  // 급여확정 여부 확인
  const isPayrollConfirmed = (employeeId: string) => {
    return payrollConfirmedEmployees.includes(employeeId);
  };

  // 중복 데이터 정리 함수 (현재 사용하지 않음 - 전체 함수 제거)

  // 검토 상태를 DB에 저장 (지점별로 분리)
  const saveReviewStatus = async (employeeId: string, status: '검토전' | '검토중' | '근무시간검토완료') => {
    try {
      console.log('🔵 검토 상태 저장 시작:', { employeeId, status, selectedMonth, selectedBranchId });
      
      // 현재 선택된 지점에 대한 상태 저장
      const reviewStatusRecord = {
        employeeId,
        status,
        month: selectedMonth,
        branchId: selectedBranchId,
        updatedAt: new Date()
      };

      // 기존 상태가 있는지 확인 (지점별로)
      const existingQuery = query(
        collection(db, 'employeeReviewStatus'),
        where('employeeId', '==', employeeId),
        where('month', '==', selectedMonth),
        where('branchId', '==', selectedBranchId)
      );
      
      const existingDocs = await getDocs(existingQuery);
      console.log('🔵 기존 검토 상태 쿼리 결과:', existingDocs.docs.length, '개');
      
      if (existingDocs.empty) {
        // 새로 추가
        // 🔥 최적화: 자주 조회하는 데이터를 역정규화하여 포함
        const selectedEmployee = employees.find(emp => emp.id === employeeId);
        const selectedBranch = branches.find(br => br.id === selectedBranchId);
        
        const optimizedReviewStatusRecord = {
          ...reviewStatusRecord,
          employeeName: selectedEmployee?.name || '알 수 없음', // 🔥 역정규화
          branchName: selectedBranch?.name || '알 수 없음', // 🔥 역정규화
        };
        
        const docRef = await addDoc(collection(db, 'employeeReviewStatus'), optimizedReviewStatusRecord);
        console.log('✅ 새로운 검토 상태 저장됨:', optimizedReviewStatusRecord);
        console.log('✅ 저장된 문서 ID:', docRef.id);
      } else {
        // 기존 데이터 업데이트
        const docId = existingDocs.docs[0].id;
        await updateDoc(doc(db, 'employeeReviewStatus', docId), reviewStatusRecord);
        console.log('✅ 기존 검토 상태 업데이트됨:', reviewStatusRecord);
      }
      
      console.log('🔵 검토 상태 저장 완료, loadReviewStatus 호출 예정');
      
      // 해당 직원만 상태 새로고침
      if ((window as unknown as { refreshEmployeeStatus?: (id: string) => void }).refreshEmployeeStatus && selectedEmployeeId) {
        (window as unknown as { refreshEmployeeStatus: (id: string) => void }).refreshEmployeeStatus(selectedEmployeeId);
      }
    } catch (error) {
      console.error('❌ 검토 상태 저장 실패:', error);
      alert('검토 상태 저장에 실패했습니다: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 검토 상태를 DB에서 로드하고, 없는 경우 기존 비교 데이터로 상태 설정
  const loadReviewStatus = useCallback(async (employeesList: typeof employees) => {
    try {
      if (!selectedMonth) return;
      
      console.log('🔥🔥🔥 ============================================');
      console.log('🔥🔥🔥 loadReviewStatus 시작 - 선택된 월:', selectedMonth);
      console.log('🔥🔥🔥 직원 목록 길이:', employeesList.length);
      
      // 해당 직원의 모든 지점의 검토 상태 조회
      const reviewStatusQuery = query(
        collection(db, 'employeeReviewStatus'),
        where('month', '==', selectedMonth)
      );
      const reviewStatusSnapshot = await getDocs(reviewStatusQuery);
      
      console.log('검토 상태 쿼리 결과 문서 수:', reviewStatusSnapshot.docs.length);
      
      const savedReviewStatuses = reviewStatusSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('🔥🔥🔥 저장된 검토 상태 데이터:', data);
        return {
          employeeId: data.employeeId,
          branchId: data.branchId,
          status: data.status as '검토전' | '검토중' | '근무시간검토완료'
        };
      });
      
      console.log('🔥🔥🔥 DB에서 로드된 검토 상태 총', savedReviewStatuses.length, '건:', savedReviewStatuses);
      
      // 김유정의 상태를 특별히 확인
      const kimYoojungStatuses = savedReviewStatuses.filter(status => status.employeeId === 'sB7t9lJAdZr4slD2rEYf');
      console.log('🔥🔥🔥 김유정의 모든 저장된 상태:', kimYoojungStatuses);
      
      // 모든 잘못된 상태 확인
      const wrongStatuses = savedReviewStatuses.filter(status => 
        status.status === '검토중'
      );
      if (wrongStatuses.length > 0) {
        console.log('⚠️ 잘못된 상태 데이터 발견:', wrongStatuses);
        console.log('이 상태들을 삭제해야 합니다!');
      }
      
      // 직원 목록이 비어있으면 저장된 상태만 사용
      if (employeesList.length === 0) {
        console.log('직원 목록이 비어있음, 저장된 상태만 사용');
        setEmployeeReviewStatus(savedReviewStatuses);
        return;
      }
      
      // 모든 직원에 대해 상태 설정
      const allReviewStatuses = await Promise.all(
        employeesList.map(async (employee) => {
          // DB에 저장된 상태들을 모두 가져오기
          const savedStatuses = savedReviewStatuses.filter(status => status.employeeId === employee.id);
          
          if (savedStatuses.length > 0) {
            // 저장된 상태가 있으면 모든 지점 상태 반환
            console.log(`직원 ${employee.name}의 저장된 상태 ${savedStatuses.length}개 사용:`, savedStatuses.map(s => s.status));
            return savedStatuses;
          }
          
          // DB에 상태가 없으면 기본적으로 검토전으로 설정
          console.log(`직원 ${employee.name}의 저장된 상태 없음, 검토전으로 설정`);
          return [{
            employeeId: employee.id,
            branchId: selectedBranchId,
            status: '검토전' as '검토전' | '검토중' | '근무시간검토완료'
          }];
        })
      );
      
      // 배열의 배열을 평면화
      const flattenedStatuses = allReviewStatuses.flat();
      setEmployeeReviewStatus(flattenedStatuses);
      console.log('최종 검토 상태 설정됨:', flattenedStatuses);
    } catch (error) {
      console.error('검토 상태 로드 실패:', error);
    }
  }, [selectedMonth, selectedBranchId]);

  // 직원 목록이 로드되면 검토 상태 로드
  useEffect(() => {
    if (employees.length > 0 && selectedMonth) {
      loadReviewStatus(employees);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, selectedMonth]);

  const loadSchedules = async (month: string) => {
    console.log('🔥🔥🔥 loadSchedules 함수 호출됨, 월:', month);
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

      console.log('🔥 스케줄 로딩 완료:', {
        전체스케줄: schedulesData.length,
        월필터링후: schedulesData.filter(schedule => {
          const scheduleDate = new Date(schedule.date);
          return scheduleDate >= startDate && scheduleDate <= endDate;
        }).length,
        지점필터링후: filteredSchedules.length,
        선택된직원: selectedEmployeeId,
        선택된지점: selectedBranchId
      });
      
      // 필터링된 스케줄 데이터 상세 로그
      console.log('🔥 필터링된 스케줄 상세:', filteredSchedules.map(s => ({
        employeeId: s.employeeId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        breakTime: s.breakTime,
        totalHours: s.totalHours
      })));
      
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

    console.log('🔥🔥🔥 실제근무 데이터 파싱 시작, 총 라인 수:', lines.length);

    lines.forEach((line, index) => {
      if (line.trim()) {
        // 🔥 탭 또는 여러 개의 공백으로 분리
        let columns = line.split('\t');
        
        // 탭으로 분리되지 않으면 (columns.length === 1) 공백으로 시도
        if (columns.length === 1) {
          // 3개 이상의 연속된 공백을 구분자로 사용
          columns = line.split(/\s{3,}/).filter(col => col.trim());
        }
        
        console.log(`🔥 라인 ${index + 1}:`, columns);
        console.log(`🔥 컬럼 개수: ${columns.length}`);
        
        if (columns.length >= 8) {
          // 🔥 두 가지 POS 데이터 형식 지원:
          // 1. 기존: 첫 번째 날짜는 무시, 두 번째가 시작일시, 세 번째가 종료일시
          // 2. 새로운: 근무일, 무시, 무시, 출근시간, 퇴근시간, 무시, 무시, 실근무시간
          
          let date = '';
          let startTime = '';
          let endTime = '';
          let totalTimeStr = '';
          let totalHours = 0;
          
          // 🔥 새로운 형식 감지: 
          // - 첫 번째 컬럼이 날짜 형식 (YYYY-MM-DD)이고
          // - 두 번째 컬럼이 날짜+시간이 아닌 경우 (새로운 형식)
          const firstCol = columns[0].trim();
          const secondCol = columns[1]?.trim() || '';
          const isNewFormat = /^\d{4}-\d{2}-\d{2}$/.test(firstCol) && 
                              !secondCol.includes(':'); // 두 번째 컬럼에 시간 포함 안 되면 새 형식
          console.log(`🔥 형식 감지: firstCol="${firstCol}", secondCol="${secondCol}", isNewFormat=${isNewFormat}`);
          
          if (isNewFormat) {
            // 🔥 새로운 형식: 근무일, 무시, 무시, 출근시간, 퇴근시간, 무시, 무시, 실근무시간
            date = firstCol; // "2025-09-01"
            const startTimeRaw = columns[3]?.trim() || ''; // 출근시간 "11:00"
            const endTimeRaw = columns[4]?.trim() || ''; // 퇴근시간 "15:00"
            const actualWorkTimeRaw = columns[7]?.trim() || ''; // 실근무시간 "4"
            
            // 🔥 출근/퇴근 시간이 없으면 이 라인은 건너뛰기
            if (!startTimeRaw || !endTimeRaw) {
              return; // 이 라인 무시
            }
            
            // 날짜에 시간 추가하여 전체 일시 형식으로 변환
            startTime = `${date} ${startTimeRaw}:00`;
            endTime = `${date} ${endTimeRaw}:00`;
            
            // 🔥 실근무시간을 그대로 사용 (휴게시간 차감 X)
            if (actualWorkTimeRaw) {
              const numericValue = parseFloat(actualWorkTimeRaw);
              if (!isNaN(numericValue)) {
                totalHours = numericValue;
              }
            }
          } else {
            // 🔥 기존 POS 형식: 무시, 근무시작일시, 근무종료일시, ..., 실제근무시간(7번째)
            startTime = columns[1]?.trim() || ''; // "2025-09-30 15:17:27"
            endTime = columns[2]?.trim() || ''; // "2025-09-30 22:59:24"
            
            // 시작일시에서 날짜 추출 (YYYY-MM-DD 형식)
            if (startTime) {
              date = startTime.split(' ')[0]; // "2025-09-30"
            }
            
            // 🔥 7번째 컬럼(인덱스 6)에서 실제근무시간 가져오기 "7:42" 형식 (최우선)
            if (columns.length > 6) {
              const col7 = columns[6]?.trim() || '';
              console.log(`🔥 7번째 컬럼(인덱스 6): "${col7}"`);
              // HH:MM 형식 체크 (0:00이 아닌 경우만)
              if (col7.includes(':') && col7.match(/^\d+:\d+$/) && col7 !== '0:00') {
                totalTimeStr = col7;
                console.log(`🔥 7번째 컬럼에서 시간 찾음: ${totalTimeStr}`);
              }
            }
            
            // 7번째 컬럼에서 못 찾으면 다른 컬럼에서 시간 형식 찾기
            if (!totalTimeStr) {
              // 먼저 4-5번째 컬럼 체크 (일부 POS는 여기에 시간이 있을 수 있음)
              for (let i = 4; i <= 5; i++) {
                const colValue = columns[i]?.trim() || '';
                if (colValue.includes(':') && colValue.match(/^\d+:\d+$/) && colValue !== '0:00') {
                  totalTimeStr = colValue;
                  console.log(`🔥 ${i+1}번째 컬럼에서 시간 찾음: ${totalTimeStr}`);
                  break;
                }
              }
            }
            
            // 그래도 못 찾으면 8-12번째 컬럼에서 찾기
            if (!totalTimeStr) {
              for (let i = 7; i < Math.min(columns.length, 12); i++) {
                const colValue = columns[i]?.trim() || '';
                if (colValue.includes(':') && colValue.match(/^\d+:\d+$/) && colValue !== '0:00') {
                  totalTimeStr = colValue;
                  console.log(`🔥 ${i+1}번째 컬럼에서 시간 찾음: ${totalTimeStr}`);
                  break;
                }
              }
            }
          }
          
          // 🔥 새로운 형식이 아닐 때만 기존 시간 파싱 로직 실행
          if (!isNewFormat) {
            // 시간을 찾지 못한 경우 시작/종료 시간으로 계산
            if (!totalTimeStr) {
              try {
                const start = new Date(startTime);
                const end = new Date(endTime);
                const diffMs = end.getTime() - start.getTime();
                totalHours = diffMs / (1000 * 60 * 60); // 시간 단위로 변환
                // console.log(`시간 계산: ${startTime} ~ ${endTime} = ${totalHours}시간`);
              } catch (error) {
                console.error('시간 계산 오류:', error);
              }
            }
          }

          // console.log(`전체 컬럼 정보:`, columns.map((col, idx) => `${idx}: "${col}"`));
          // console.log(`파싱된 데이터: 날짜=${date}, 시작=${startTime}, 종료=${endTime}, 총시간=${totalTimeStr}`);

          // 🔥 기존 형식일 때만 시간 문자열을 파싱
          if (!isNewFormat && totalTimeStr) {
            try {
              console.log(`🔥 시간 문자열 파싱: "${totalTimeStr}"`);
              
              // 여러 가지 시간 형식 시도
              if (totalTimeStr.includes(':')) {
                const timeParts = totalTimeStr.split(':');
                console.log(`🔥 시간 파싱: ${totalTimeStr} -> parts:`, timeParts);
                
                if (timeParts.length === 2) {
                  const hours = parseInt(timeParts[0], 10);
                  const minutes = parseInt(timeParts[1], 10);
                  console.log(`🔥 시간 변환: hours=${hours}, minutes=${minutes}`);
                  
                  if (!isNaN(hours) && !isNaN(minutes)) {
                    totalHours = hours + (minutes / 60);
                    console.log(`🔥 최종 계산: ${hours} + (${minutes}/60) = ${totalHours}`);
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
                  // console.log(`숫자로 파싱: ${totalTimeStr} -> ${totalHours}`);
                } else {
                  console.error('시간 파싱 실패: 숫자도 아니고 시간 형식도 아님', totalTimeStr);
                }
              }
            } catch (error) {
              console.error('시간 파싱 오류:', error, '원본 데이터:', totalTimeStr);
            }
          }

          // posTimeRange 생성 (시간만 추출: "10:02-22:32" 형태)
          let posTimeRange = '';
          if (startTime && endTime) {
            try {
              const startTimeOnly = startTime.split(' ')[1]?.split(':').slice(0, 2).join(':') || '';
              const endTimeOnly = endTime.split(' ')[1]?.split(':').slice(0, 2).join(':') || '';
              if (startTimeOnly && endTimeOnly) {
                posTimeRange = `${startTimeOnly}-${endTimeOnly}`;
              }
            } catch (error) {
              console.error('posTimeRange 생성 오류:', error);
            }
          }

          records.push({
            date,
            startTime,
            endTime,
            totalHours,
            isNewFormat: isNewFormat, // 새로운 형식 여부 저장
            posTimeRange: posTimeRange // POS 원본 시간 범위
          });
        } else {
          // console.log(`라인 ${index + 1} 컬럼 수 부족:`, columns.length);
        }
      }
    });

    // console.log('파싱 완료된 실제근무 데이터:', records);
    return records;
  };

  const compareWorkTimes = async () => {
    console.log('🔥🔥🔥 compareWorkTimes 함수 호출됨');
    console.log('🔥🔥🔥 선택된 지점:', selectedBranchId);
    console.log('🔥🔥🔥 선택된 월:', selectedMonth);
    console.log('🔥🔥🔥 선택된 직원:', selectedEmployeeId);
    console.log('🔥🔥🔥 실제근무 데이터 길이:', actualWorkData.length);
    console.log('🔥🔥🔥 스케줄 개수:', schedules.length);

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

    // 기존 비교 데이터가 있는 경우 확인 메시지 표시
    if (comparisonResults.length > 0) {
      const confirmed = confirm('기존 근무시간비교 데이터가 삭제됩니다.\n계속하시겠습니까?');
      if (!confirmed) {
        return;
      }
    }

    // 스케줄 데이터가 없으면 먼저 로드
    if (schedules.length === 0) {
      console.log('🔥🔥🔥 스케줄 데이터가 없어서 로드 시작');
      await loadSchedules(selectedMonth);
    }

    // 근무시간 비교 시작 시 자동으로 검토중 상태로 변경
    try {
      console.log('🔄 근무시간 비교 시작 - 검토중 상태로 변경');
      await saveReviewStatus(selectedEmployeeId, '검토중');
      await loadReviewStatus(employees);
    } catch (error) {
      console.error('❌ 검토중 상태 변경 실패:', error);
    }

    if (!actualWorkData.trim()) {
      // 실제근무 데이터가 없어도 스케줄 데이터만으로 리스트 표시
      console.log('🔥 실제근무 데이터 없음, 스케줄 데이터만으로 리스트 생성');
      console.log('🔥 전체 스케줄 수:', schedules.length);
      console.log('🔥 선택된 직원 ID:', selectedEmployeeId);
      console.log('🔥 필터링된 스케줄:', schedules.filter(schedule => schedule.employeeId === selectedEmployeeId));
      
      const scheduleOnlyComparisons: WorkTimeComparison[] = [];
      
      schedules
        .filter(schedule => schedule.employeeId === selectedEmployeeId)
        .forEach(schedule => {
          const scheduleDate = schedule.date.toISOString().split('T')[0];
          const breakTime = parseFloat(schedule.breakTime) || 0;
          const actualBreakTime = breakTime; // 최초 스케줄 휴게시간으로 설정
          
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
            actualBreakTime: actualBreakTime, // 스케줄 휴게시간으로 설정
            actualWorkHours: 0
          });
        });
      
      // console.log('스케줄만으로 생성된 비교 결과:', scheduleOnlyComparisons);
      setComparisonResults(scheduleOnlyComparisons);
      
      // 스케줄만으로 생성된 비교결과도 DB에 저장
      await saveComparisonResults(scheduleOnlyComparisons);
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
    // console.log('파싱된 실제근무 데이터:', actualRecords);

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
        const actualBreakTime = breakTime; // 최초 스케줄 휴게시간 가져오기
        console.log(`🔥 스케줄과 실제근무 매칭: ${scheduleDate}, breakTime: ${breakTime}, actualBreakTime: ${actualBreakTime}`);
        
        // 🔥 새로운 계산 방식: actualWorkHours = actualTimeRange시간 - actualBreakTime
        const actualTimeRange = actualRecord.posTimeRange || formatTimeRange(actualRecord.startTime, actualRecord.endTime);
        const actualTimeRangeHours = parseTimeRangeToHours(actualTimeRange);
        const actualWorkHours = Math.max(0, actualTimeRangeHours - actualBreakTime);
        
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
          actualTimeRange: actualRecord.posTimeRange || formatTimeRange(actualRecord.startTime, actualRecord.endTime),
          isModified: false,
          breakTime: breakTime,
          actualBreakTime: actualBreakTime, // 계산된 actualBreakTime 사용
          actualWorkHours: actualWorkHours,
          posTimeRange: actualRecord.posTimeRange || '' // POS 원본 시간 범위
        });

        processedDates.add(scheduleDate);
      } else {
        // 스케줄은 있지만 실제근무 데이터가 없는 경우
        // 휴게시간과 실근무시간 계산 (실제근무 데이터가 없는 경우)
        const breakTime = parseFloat(schedule.breakTime) || 0;
        const actualBreakTime = breakTime; // 최초 스케줄 휴게시간 가져오기
        console.log(`🔥 스케줄만 있음: ${scheduleDate}, breakTime: ${breakTime}, actualBreakTime: ${actualBreakTime}`);
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
          actualBreakTime: actualBreakTime, // 계산된 actualBreakTime 사용
          actualWorkHours: actualWorkHours,
          posTimeRange: '' // 실제근무 데이터가 없으므로 빈 값
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
        const actualBreakTime = 0; // 최초 스케줄 휴게시간 가져오기 (스케줄 없으므로 0)
        console.log(`🔥 실제근무만 있음: ${actualRecord.date}, breakTime: ${breakTime}, actualBreakTime: ${actualBreakTime}`);
        // 🔥 새로운 계산 방식: actualWorkHours = actualTimeRange시간 - actualBreakTime
        const actualTimeRange = actualRecord.posTimeRange || formatTimeRange(actualRecord.startTime, actualRecord.endTime);
        const actualTimeRangeHours = parseTimeRangeToHours(actualTimeRange);
        const actualWorkHours = Math.max(0, actualTimeRangeHours - actualBreakTime);
        
        comparisons.push({
          employeeName: employeeName,
          date: actualRecord.date,
          scheduledHours: 0,
          actualHours: actualRecord.totalHours,
          difference: actualRecord.totalHours,
          status: 'review_required', // 스케줄 없이 근무한 경우 검토필요
          scheduledTimeRange: '-',
          actualTimeRange: actualRecord.posTimeRange || formatTimeRange(actualRecord.startTime, actualRecord.endTime),
          isModified: false,
          breakTime: breakTime,
          actualBreakTime: actualBreakTime, // 계산된 actualBreakTime 사용
          actualWorkHours: actualWorkHours,
          posTimeRange: actualRecord.posTimeRange || '' // POS 원본 시간 범위
        });
      }
    });

    // 날짜순으로 정렬
    comparisons.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log('비교 결과:', comparisons);
    setComparisonResults(comparisons);
    
    // 비교결과를 DB에 저장
    await saveComparisonResults(comparisons);
    
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
          if (employeeData.type === '근로소득자' || employeeData.employmentType === '근로소득') {
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
            ? { ...status, status: '검토중' as '검토전' | '검토중' | '근무시간검토완료' }
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

  // 시간 범위 문자열을 시간으로 변환하는 함수 (예: "10:02-22:32" -> 12.5시간)
  const parseTimeRangeToHours = (timeRange: string): number => {
    if (!timeRange || timeRange === '-' || !timeRange.includes('-')) {
      return 0;
    }
    
    try {
      const [startTime, endTime] = timeRange.split('-');
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;
      
      // 다음날로 넘어가는 경우 처리 (예: 22:00-06:00)
      let diffMinutes = endMinutes - startMinutes;
      if (diffMinutes < 0) {
        diffMinutes += 24 * 60; // 24시간 추가
      }
      
      return diffMinutes / 60; // 시간으로 변환
    } catch (error) {
      console.error('시간 범위 파싱 오류:', error, 'timeRange:', timeRange);
      return 0;
    }
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
        // 단, 근로소득, 사업소득만 해당
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
  // 비교결과를 DB에 저장하는 함수
  const saveComparisonResults = async (results: WorkTimeComparison[]) => {
    if (!selectedEmployeeId || !selectedMonth) return;
    
    try {
      console.log('비교결과 저장 시작:', results.length, '건');
      
      // 매니저의 경우 userBranch.id 사용, 일반 사용자의 경우 selectedBranchId 사용
      const branchId = isManager && userBranch ? userBranch.id : selectedBranchId;
      
      // 기존 비교결과 데이터 삭제
      const existingQuery = query(
        collection(db, 'workTimeComparisonResults'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth),
        where('branchId', '==', branchId)
      );
      
      const existingSnapshot = await getDocs(existingQuery);
      console.log('기존 비교결과 데이터 삭제:', existingSnapshot.docs.length, '건');
      
      // 기존 데이터 삭제
      for (const doc of existingSnapshot.docs) {
        await deleteDoc(doc.ref);
      }
      
      // 새 데이터 저장
      for (const result of results) {
        await addDoc(collection(db, 'workTimeComparisonResults'), {
          employeeId: selectedEmployeeId,
          employeeName: result.employeeName,
          month: selectedMonth,
          branchId: branchId,
          date: result.date,
          scheduledHours: result.scheduledHours,
          actualHours: result.actualHours,
          difference: result.difference,
          status: result.status,
          scheduledTimeRange: result.scheduledTimeRange,
          actualTimeRange: result.actualTimeRange,
          isModified: result.isModified || false,
          breakTime: result.breakTime || 0,
          actualBreakTime: result.actualBreakTime || 0, // 신규 필드 추가
          actualWorkHours: result.actualWorkHours || 0,
          posTimeRange: result.posTimeRange || '', // 신규 필드 추가
          createdAt: new Date()
        });
      }
      
      console.log('비교결과 저장 완료');
    } catch (error) {
      console.error('비교결과 저장 실패:', error);
    }
  };

  const loadExistingComparisonData = useCallback(async () => {
    if (!selectedEmployeeId || !selectedMonth) {
      setComparisonResults([]);
      return;
    }
    
    try {
      console.log('기존 비교 데이터 로드 시작:', selectedEmployeeId, selectedMonth);
      
      // 매니저의 경우 userBranch.id 사용, 일반 사용자의 경우 selectedBranchId 사용
      const branchId = isManager && userBranch ? userBranch.id : selectedBranchId;
      
      const querySnapshot = await getDocs(
        query(
          collection(db, 'workTimeComparisonResults'),
          where('employeeId', '==', selectedEmployeeId),
          where('month', '==', selectedMonth),
          where('branchId', '==', branchId)
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
            actualBreakTime: data.actualBreakTime || 0, // 신규 필드 추가
            actualWorkHours: data.actualWorkHours || 0,
            posTimeRange: data.posTimeRange || '' // 신규 필드 추가
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
          if (currentStatus !== '근무시간검토완료') {
            console.log('검토중 상태로 변경:', selectedEmployeeId);
            setEmployeeReviewStatus(prev => {
              const updated = prev.map(status => 
                status.employeeId === selectedEmployeeId 
                  ? { ...status, status: '검토중' as '검토전' | '검토중' | '근무시간검토완료' }
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
        // console.log('기존 비교 데이터 없음, 초기화됨');
      }
    } catch (error) {
      console.error('기존 비교 데이터 로드 실패:', error);
      setComparisonResults([]);
    }
  }, [selectedEmployeeId, selectedMonth, selectedBranchId, isManager, userBranch, employeeReviewStatus]);

  // 지점과 직원이 선택되고 비교결과가 있으면 자동으로 로드
  useEffect(() => {
    if (hideBranchSelection && selectedBranchId && selectedEmployeeId && selectedMonth) {
      loadExistingComparisonData();
    }
  }, [hideBranchSelection, selectedBranchId, selectedEmployeeId, selectedMonth, loadExistingComparisonData]);

  // 모든 비교 결과를 DB에 저장하는 함수
  const saveAllComparisonResults = useCallback(async (results: WorkTimeComparison[]) => {
    if (!selectedEmployeeId || !selectedMonth) {
      console.log('저장 실패: 직원ID 또는 월이 없음');
      return;
    }
    
    try {
      console.log('DB 저장 시작:', selectedEmployeeId, selectedMonth, results.length, '건');
      
      // 매니저의 경우 userBranch.id 사용, 일반 사용자의 경우 selectedBranchId 사용
      const branchId = isManager && userBranch ? userBranch.id : selectedBranchId;
      
      // 기존 데이터 삭제
      const existingQuery = query(
        collection(db, 'actualWorkRecords'),
        where('employeeId', '==', selectedEmployeeId),
        where('month', '==', selectedMonth),
        where('branchId', '==', branchId)
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
          branchId: branchId,
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
  }, [selectedEmployeeId, selectedMonth, selectedBranchId, isManager, userBranch]);

  // 수정된 데이터를 DB에 저장
  const saveModifiedData = async (result: WorkTimeComparison) => {
    try {
      // 매니저의 경우 userBranch.id 사용, 일반 사용자의 경우 selectedBranchId 사용
      const branchId = isManager && userBranch ? userBranch.id : selectedBranchId;
      
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
        branchId: branchId,
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

      // workTimeComparisonResults 컬렉션에도 저장 (비교결과용)
      const comparisonQuery = query(
        collection(db, 'workTimeComparisonResults'),
        where('employeeId', '==', selectedEmployeeId),
        where('date', '==', result.date),
        where('month', '==', selectedMonth),
        where('branchId', '==', branchId)
      );
      
      const comparisonDocs = await getDocs(comparisonQuery);
      
      if (comparisonDocs.empty) {
        // 새로 추가
        await addDoc(collection(db, 'workTimeComparisonResults'), {
          ...actualWorkRecord,
          createdAt: new Date()
        });
        console.log('새로운 비교결과 데이터 저장됨:', actualWorkRecord);
      } else {
        // 기존 데이터 업데이트 (첫 번째 문서만)
        const docId = comparisonDocs.docs[0].id;
        await updateDoc(doc(db, 'workTimeComparisonResults', docId), {
          ...actualWorkRecord,
          createdAt: new Date()
        });
        console.log('기존 비교결과 데이터 업데이트됨:', actualWorkRecord);
        
        // 중복 데이터가 있으면 삭제
        if (comparisonDocs.docs.length > 1) {
          for (let i = 1; i < comparisonDocs.docs.length; i++) {
            await deleteDoc(comparisonDocs.docs[i].ref);
            console.log('중복 비교결과 데이터 삭제됨:', comparisonDocs.docs[i].id);
          }
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
          <button
            onClick={() => setShowMenuDescription(!showMenuDescription)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-blue-800 ml-3">메뉴 설명 및 사용 방법</h3>
            </div>
            <svg
              className={`h-5 w-5 text-blue-400 transition-transform ${showMenuDescription ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showMenuDescription && (
            <div className="mt-4">
              <div className="text-sm text-blue-700 space-y-1">
                <p>• 매월 초 한번씩 전달의 스케쥴과 실제근무 시간을 비교합니다</p>
                <p>• 비교할 월을 선택하고 실제근무 데이터를 복사붙여넣기합니다</p>
                <p>• 차이가 있는 경우 초과/부족 시간을 확인하고, 수정할 수 있습니다</p>
              </div>
              
              <h3 className="text-sm font-medium text-blue-800 mt-4 mb-2">사용 방법</h3>
              <div className="text-sm text-blue-700 space-y-1">
                <p>1. 직원 선택</p>
                <p>2. POS에서 실제 근무 데이터 붙여넣기</p>
                <p>3. 근무시간 비교 버튼 클릭해서 차이나는 시간을 조정</p>
                <p>4. 모든 스케쥴 수정/확인 완료 시 검토완료 상태로 변경</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 선택된 월 표시 */}
      {selectedMonth && (
        <div className="mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <div className="text-blue-600 font-medium">
                📅 선택된 월: {selectedMonth}
              </div>
            </div>
          </div>
        </div>
      )}

        {/* 전체 검토 상태 */}
        {selectedEmployeeId && (
          <div className="bg-white shadow rounded-lg overflow-hidden mb-6 w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">전체 검토 상태</h3>
            </div>
            <div className="px-6 py-4 w-full">
              {(() => {
                const isPayrollConfirmed = payrollConfirmedEmployees.includes(selectedEmployeeId);
                
                // 해당 직원의 모든 지점 상태 조회
                const employeeStatuses = employeeReviewStatus.filter(status => status.employeeId === selectedEmployeeId);
                console.log(`🔥🔥🔥 ${employees.find(e => e.id === selectedEmployeeId)?.name} 전체 상태:`, employeeStatuses);
                console.log(`🔥🔥🔥 직원 지점 목록:`, employeeBranches);
                
                return (
                  <div className="space-y-4">
                    {/* 급여확정 상태 */}
                    {isPayrollConfirmed && (
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                          급여확정완료
                        </span>
                      </div>
                    )}
                    
                    {/* 지점별 검토 상태 */}
                    {!isPayrollConfirmed && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-gray-700">지점별 검토 상태</h4>
                        {employeeBranches.length > 0 ? (
                          employeeBranches.map(branchId => {
                            const branch = branches.find(b => b.id === branchId);
                            const branchStatus = employeeStatuses.find(status => status.branchId === branchId);
                            const status = branchStatus?.status || '검토전';
                            
                            console.log(`🔥 지점 ${branch?.name} (${branchId}) 상태:`, status, 'branchStatus:', branchStatus);
                            
                            return (
                              <div key={branchId} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors w-full ${
                                selectedBranchId === branchId 
                                  ? 'border-blue-500 bg-blue-50' 
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                              onClick={() => {
                                setSelectedBranchId(branchId);
                                console.log('🔥 지점 선택됨:', branchId, branch?.name);
                                // 🔥 지점 변경 시 해당 지점의 비교 데이터 다시 로드 (현재 비활성화)
                                // loadExistingComparisonData();
                              }}>
                                <div className="flex items-center space-x-3 flex-1">
                                  <span className={`text-sm font-medium ${
                                    selectedBranchId === branchId ? 'text-blue-700' : 'text-gray-700'
                                  }`}>
                                    {branch?.name || `지점 ${branchId}`}
                                  </span>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    status === '급여확정완료' ? 'bg-purple-100 text-purple-800' :
                                    status === '근무시간검토완료' ? 'bg-green-100 text-green-800' :
                                    status === '검토중' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {status}
                                  </span>
                                </div>
                                {/* 급여확정완료 상태일 때는 버튼 숨김 */}
                                <div className="flex space-x-2">
                                  {status === '급여확정완료' ? (
                                    <span className="text-sm text-gray-500 font-medium">급여확정완료</span>
                                  ) : status === '근무시간검토완료' ? (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        // 🔥 급여확정완료 상태 확인
                                        const isPayrollConfirmed = employeeReviewStatus.some(s => 
                                          s.employeeId === selectedEmployeeId && s.status === '급여확정완료'
                                        );
                                        
                                        if (isPayrollConfirmed) {
                                          alert('급여확정완료 상태에서는 검토상태를 변경할 수 없습니다.');
                                          return;
                                        }
                                        
                                        if (confirm(`${branch?.name} 지점의 검토완료를 취소하시겠습니까?`)) {
                                          // 🔥 상태를 '검토중'으로 변경
                                          setEmployeeReviewStatus(prev => {
                                            return prev.map(s => 
                                              s.employeeId === selectedEmployeeId && s.branchId === branchId
                                                ? { ...s, status: '검토중' as '검토전' | '검토중' | '근무시간검토완료' | '근무시간검토완료' }
                                                : s
                                            );
                                          });
                                          
                                          // 🔥 비교 결과 테이블 강제 리렌더링을 위해 복사
                                          setComparisonResults([...comparisonResults]);
                                          
                                          await saveReviewStatus(selectedEmployeeId, '검토중');
                                        }
                                      }}
                                      className="bg-orange-600 text-white px-3 py-1 rounded text-xs hover:bg-orange-700"
                                    >
                                      검토완료취소
                                    </button>
                                  ) : status === '검토중' ? (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        // 🔥 급여확정완료 상태 확인
                                        const isPayrollConfirmed = employeeReviewStatus.some(s => 
                                          s.employeeId === selectedEmployeeId && s.status === '급여확정완료'
                                        );
                                        
                                        if (isPayrollConfirmed) {
                                          alert('급여확정완료 상태에서는 검토상태를 변경할 수 없습니다.');
                                          return;
                                        }
                                        
                                        if (confirm(`${branch?.name} 지점의 검토를 완료하시겠습니까?`)) {
                                          // 🔥 상태를 '근무시간검토완료'로 변경
                                          setEmployeeReviewStatus(prev => {
                                            return prev.map(s => 
                                              s.employeeId === selectedEmployeeId && s.branchId === branchId
                                                ? { ...s, status: '근무시간검토완료' as '검토전' | '검토중' | '근무시간검토완료' | '근무시간검토완료' }
                                                : s
                                            );
                                          });
                                          
                                          // 🔥 비교 결과 테이블 강제 리렌더링을 위해 복사
                                          setComparisonResults([...comparisonResults]);
                                          
                                          await saveReviewStatus(selectedEmployeeId, '근무시간검토완료');
                                          // 🔥 loadReviewStatus 제거: 이미 상태를 업데이트했으므로 불필요
                                          // await loadReviewStatus(employees);
                                          
                                          // 🔥 비교 결과 테이블 강제 리렌더링
                                          setComparisonResults([...comparisonResults]);
                                        }
                                      }}
                                      className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                                    >
                                      검토완료
                                    </button>
                                  ) : (
                                    // 🔥 검토전 상태: 검토완료 버튼 표시 (비교 데이터가 있으면 바로 완료 가능)
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        console.log('🔥🔥🔥 검토완료 버튼 클릭됨 (검토전 상태)');
                                        console.log('🔥🔥🔥 branchId:', branchId, 'branch name:', branch?.name);
                                        console.log('🔥🔥🔥 selectedEmployeeId:', selectedEmployeeId);
                                        console.log('🔥🔥🔥 selectedBranchId:', selectedBranchId);
                                        
                                        if (confirm(`${branch?.name} 지점의 검토를 완료하시겠습니까?`)) {
                                          console.log('🔥🔥🔥 확인 클릭됨!');
                                          
                                          // 🔥 상태를 '근무시간검토완료'로 변경
                                          setEmployeeReviewStatus(prev => {
                                            const existing = prev.find(s => 
                                              s.employeeId === selectedEmployeeId && s.branchId === branchId
                                            );
                                            
                                            console.log('🔥🔥🔥 기존 상태:', existing);
                                            
                                            if (existing) {
                                              const updated = prev.map(s => 
                                                s.employeeId === selectedEmployeeId && s.branchId === branchId
                                                  ? { ...s, status: '근무시간검토완료' as '검토전' | '검토중' | '근무시간검토완료' | '근무시간검토완료' }
                                                  : s
                                              );
                                              console.log('🔥🔥🔥 기존 상태 업데이트:', updated);
                                              return updated;
                                            } else {
                                              // 상태가 없으면 새로 추가
                                              const newStatus = { 
                                                employeeId: selectedEmployeeId, 
                                                branchId: branchId, 
                                                status: '근무시간검토완료' as '검토전' | '검토중' | '근무시간검토완료' | '근무시간검토완료' 
                                              };
                                              console.log('🔥🔥🔥 새로운 상태 추가:', newStatus);
                                              return [...prev, newStatus];
                                            }
                                          });
                                          
                                          setComparisonResults([...comparisonResults]);
                                          
                                          console.log('🔥🔥🔥 saveReviewStatus 호출 직전, branchId:', branchId);
                                          await saveReviewStatus(selectedEmployeeId, '근무시간검토완료');
                                          console.log('🔥🔥🔥 saveReviewStatus 호출 완료');
                                        } else {
                                          console.log('🔥🔥🔥 확인 취소됨');
                                        }
                                      }}
                                      className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                                    >
                                      검토완료
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-sm text-gray-500">지점 정보가 없습니다.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </div>

      {/* 직원 리스트 테이블 */}
      {!hideEmployeeSelection && selectedBranchId && selectedMonth && employees.length > 0 ? (
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
                              case '근무시간검토완료': return 'text-green-600 bg-green-50';
                              case '급여확정완료': return 'text-purple-600 bg-purple-50';
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
      {!isPayrollConfirmed(selectedEmployeeId) && (() => {
        // 급여확정완료 상태인지 확인
        const reviewStatus = employeeReviewStatus.find(status => 
          status.employeeId === selectedEmployeeId && status.branchId === selectedBranchId
        );
        return reviewStatus?.status !== '급여확정완료';
      })() && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            실제근무 데이터 (복사붙여넣기) <span className="text-red-500">*</span>
          </label>
        
        {/* 도움말 */}
        <div className="mb-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <button
            onClick={() => setShowDataCopyMethod(!showDataCopyMethod)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <h4 className="text-sm font-medium text-blue-900 ml-3">데이터 복사 방법</h4>
            </div>
            <svg
              className={`h-5 w-5 text-blue-400 transition-transform ${showDataCopyMethod ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showDataCopyMethod && (
            <div className="mt-4">
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
                        modal.innerHTML = 
                          '<div class="bg-white p-4 rounded-lg max-w-6xl max-h-[90vh] overflow-auto">' +
                            '<div class="flex justify-between items-center mb-4">' +
                              '<h3 class="text-lg font-semibold">POS ASP 시스템 화면 예시</h3>' +
                              '<button onclick="this.closest(\'.fixed\').remove()" class="text-gray-500 hover:text-gray-700 text-xl">&times;</button>' +
                            '</div>' +
                            '<div class="text-sm text-gray-600 mb-4">' +
                              '<p><strong>복사할 영역:</strong> 아래 표에서 해당 직원의 전체 데이터 행을 선택하여 복사하세요.</p>' +
                              '<p><strong>주의:</strong> 표 헤더는 제외하고 데이터 행만 복사해야 합니다.</p>' +
                            '</div>' +
                            '<div class="bg-gray-100 p-4 rounded border">' +
                              '<p class="text-xs text-gray-500 mb-2">POS ASP 시스템 → 기타관리 → 근태관리 → 월근태내역 화면</p>' +
                              '<div class="bg-white border rounded p-3">' +
                                '<img src="/images/pos-asp-example.png" alt="POS ASP 시스템 화면 예시" class="w-full h-auto border rounded" onerror="console.log(\'이미지 로드 실패:\', this); this.style.display=\'none\';" />' +
                              '</div>' +
                              '<div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">' +
                                '<p class="font-medium text-yellow-800 mb-2">💡 복사 방법:</p>' +
                                '<ul class="text-yellow-700 space-y-1">' +
                                  '<li>• 위 표에서 해당 직원의 데이터 행들을 마우스로 드래그하여 선택한 후 Ctrl+C로 복사하세요.</li>' +
                                  '<li>• 헤더는 제외하고 데이터 행만 복사</li>' +
                                  '<li>• 여러 날의 데이터가 있는 경우 모든 행을 포함</li>' +
                                '</ul>' +
                              '</div>' +
                            '</div>' +
                          '</div>';
                        document.body.appendChild(modal);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-xs underline"
                    >
                      📷 POS ASP 화면 예시 보기
                    </button>
                  </div>
                </div>
                
                <div className="mt-6">
                  <p><strong>지점별로 관리하는 출퇴근시간관리엑셀에서 복사하기:</strong></p>
                  <div className="mt-3 p-2 bg-white border border-blue-300 rounded text-xs">
                    <p className="font-medium text-gray-700">복사 예시:</p>
                    <p className="text-gray-600 font-mono">2025-09-01	월	1	11:00	15:00		4</p>
                    <div className="mt-2">
                      <button
                        onClick={() => {
                          const modal = document.createElement('div');
                          modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
                          modal.innerHTML = 
                            '<div class="bg-white p-4 rounded-lg max-w-6xl max-h-[90vh] overflow-auto">' +
                              '<div class="flex justify-between items-center mb-4">' +
                                '<h3 class="text-lg font-semibold">출퇴근시간관리엑셀 화면 예시</h3>' +
                                '<button onclick="this.closest(\'.fixed\').remove()" class="text-gray-500 hover:text-gray-700 text-xl">&times;</button>' +
                              '</div>' +
                              '<div class="text-sm text-gray-600 mb-4">' +
                                '<p><strong>복사할 영역:</strong> 엑셀에서 해당 직원의 전체 데이터 행을 선택하여 복사하세요.</p>' +
                                '<p><strong>주의:</strong> 표 헤더는 제외하고 데이터 행만 복사해야 합니다.</p>' +
                              '</div>' +
                              '<div class="bg-gray-100 p-4 rounded border">' +
                                '<p class="text-xs text-gray-500 mb-2">출퇴근시간관리엑셀 화면</p>' +
                                '<div class="bg-white border rounded p-3">' +
                                  '<img src="/images/excel-attendance-example.png" alt="출퇴근시간관리엑셀 화면 예시" class="w-full h-auto border rounded" onerror="console.log(\'이미지 로드 실패:\', this); this.style.display=\'none\';" />' +
                                '</div>' +
                                '<div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">' +
                                  '<p class="font-medium text-yellow-800 mb-2">💡 복사 방법:</p>' +
                                  '<ul class="text-yellow-700 space-y-1">' +
                                    '<li>• 엑셀에서 해당 직원의 데이터 행들을 선택한 후 Ctrl+C로 복사하세요.</li>' +
                                    '<li>• 형식: 날짜, 요일, 주차, 출근, 퇴근, 휴게-점심, 휴게-저녁, 근무시간</li>' +
                                    '<li>• 출근/퇴근 시간이 없는 행은 자동으로 무시됩니다.</li>' +
                                  '</ul>' +
                                '</div>' +
                              '</div>' +
                            '</div>';
                          document.body.appendChild(modal);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-xs underline"
                      >
                        📷 출퇴근시간관리엑셀 화면 예시 보기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <textarea
          value={actualWorkData}
          onChange={(e) => setActualWorkData(e.target.value)}
          placeholder="POS ASP 시스템 또는 지점별로 관리하는 출퇴근시간관리엑셀에서 복사한 실제근무 데이터를 붙여넣으세요..."
          className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        </div>
      )}

      {/* 비교 실행 버튼 */}
      {!isPayrollConfirmed(selectedEmployeeId) && (() => {
        // 급여확정완료 상태인지 확인
        const reviewStatus = employeeReviewStatus.find(status => 
          status.employeeId === selectedEmployeeId && status.branchId === selectedBranchId
        );
        return reviewStatus?.status !== '급여확정완료';
      })() && (
        <div className="mb-6">
          <button
            onClick={() => {
              console.log('🔥🔥🔥 근무시간 비교 버튼 클릭됨');
              compareWorkTimes();
            }}
            disabled={loading || (() => {
              const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);
              if (!selectedEmployee) return false;
              // 현재 선택된 지점의 검토상태만 확인
              const reviewStatus = employeeReviewStatus.find(status => 
                status.employeeId === selectedEmployeeId && status.branchId === selectedBranchId
              );
              return reviewStatus?.status === '근무시간검토완료';
            })()}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? '로딩 중...' : (() => {
              const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);
              if (!selectedEmployee) return '근무시간 비교';
              const reviewStatus = employeeReviewStatus.find(status => status.employeeId === selectedEmployeeId);
              return reviewStatus?.status === '근무시간검토완료' ? '검토완료 (비교 불가)' : '근무시간 비교';
            })()}
          </button>
        </div>
      )}


      {/* 비교 결과 */}
      {(() => {
        // 🔥 통일된 편집 가능 여부 조건
        const currentBranchStatus = employeeReviewStatus.find(status => 
          status.employeeId === selectedEmployeeId && status.branchId === selectedBranchId
        );
        const isEditable = currentBranchStatus?.status !== '근무시간검토완료';
        
        return (
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {(() => {
              const selectedEmployeeName = employees.find(emp => emp.id === selectedEmployeeId)?.name || '선택된 직원';
              return `${selectedEmployeeName} 비교결과 ${comparisonResults.length > 0 ? `(${comparisonResults.length}건)` : ''}`;
            })()}
          </h3>
        </div>
        
        {comparisonResults.length > 0 && (
          <div>
            {/* 확인완료 상태 표시 */}
            <div className="mb-4">
              <div className="text-sm text-gray-600">
                {(() => {
                  const completedCount = comparisonResults.filter(result => 
                    result.status === 'review_completed' || result.status === 'time_match'
                  ).length;
                  const totalCount = comparisonResults.length;
                  const allReviewCompleted = completedCount === totalCount && totalCount > 0;
                  return (
                    <span>
                      {completedCount}/{totalCount} 항목 확인완료
                      {allReviewCompleted && <span className="ml-2 text-green-600 font-semibold">✓ 전체 검토완료</span>}
                    </span>
                  );
                })()}
              </div>
            </div>
            
            <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    날짜
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    스케줄시간(A)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    POS근무시각
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    실근무시각(B)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    실휴게시간(C)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    실근무시간 (D=B-C)
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    차이 (A-D)
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
                  
                  // const allReviewCompleted = isBranchReviewCompleted || (completedCount === comparisonResults.length && comparisonResults.length > 0);
                  
                  return (
                    <tr key={index} className={`hover:bg-gray-50 ${rowBgColor} border-t border-gray-200`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {result.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        <div className="space-y-1">
                          {/* 스케줄 근무시간 표시 */}
                          <div className="text-xs text-gray-500 font-medium">
                            {(() => {
                              // scheduledHours는 이미 휴게시간을 제외한 순 근무시간이므로 그대로 사용
                              const scheduledWorkHours = result.scheduledHours;
                              const hours = Math.floor(scheduledWorkHours);
                              const minutes = Math.round((scheduledWorkHours - hours) * 60);
                              return `${hours}:${minutes.toString().padStart(2, '0')}`;
                            })()}
                          </div>
                          {/* 스케줄 시간 표시: 7:00 또는 9:30-17:00(0:30) 형태 */}
                          <div>{(() => {
                            const hours = Math.floor(result.scheduledHours);
                            const minutes = Math.round((result.scheduledHours - hours) * 60);
                            const breakTime = result.breakTime || 0;
                            const breakHours = Math.floor(breakTime);
                            const breakMinutes = Math.round((breakTime - breakHours) * 60);
                            
                            // scheduledTimeRange가 있으면 항상 시간범위 형태로 표시
                            if (result.scheduledTimeRange && result.scheduledTimeRange !== '-') {
                              if (breakTime > 0) {
                                // 휴게시간이 있는 경우: 9:30-17:00(0:30) 형태
                                return `${result.scheduledTimeRange}(${breakHours}:${breakMinutes.toString().padStart(2, '0')})`;
                              } else {
                                // 휴게시간이 없는 경우: 9:30-17:00 형태
                                return `${result.scheduledTimeRange}`;
                              }
                            } else {
                              // scheduledTimeRange가 없는 경우에만 hours:minutes 형태
                              console.log(`🔥 스케줄시간 표시: ${result.date}, scheduledTimeRange: ${result.scheduledTimeRange}, breakTime: ${breakTime}, hours: ${hours}, minutes: ${minutes}`);
                              return `${hours}:${minutes.toString().padStart(2, '0')}`;
                            }
                          })()}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        <span className="text-gray-600">{result.posTimeRange || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {!isEditable || result.status === 'review_completed' || isPayrollConfirmed(selectedEmployeeId) ? (
                          <span className="text-gray-600">{result.actualTimeRange || '-'}</span>
                        ) : (
                          <input
                            type="text"
                            value={result.actualTimeRange || ''}
                            onChange={(e) => {
                              const newActualTimeRange = e.target.value;
                              const updatedResults = [...comparisonResults];
                              updatedResults[index] = {
                                ...result,
                                actualTimeRange: newActualTimeRange,
                                // actualWorkHours 재계산
                                actualWorkHours: Math.max(0, parseTimeRangeToHours(newActualTimeRange) - (result.actualBreakTime || 0)),
                                // posTimeRange는 변경하지 않음 (POS 원본 데이터 유지)
                                isModified: true
                              };
                              setComparisonResults(updatedResults);
                            }}
                            className="w-30 px-2 py-1 border border-gray-300 rounded text-xs text-center"
                            placeholder="10:02-22:32"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {!isEditable || result.status === 'review_completed' || isPayrollConfirmed(selectedEmployeeId) ? (
                          <span className="text-gray-600">
                            {(() => {
                              const actualBreakTime = result.actualBreakTime || 0;
                              const hours = Math.floor(actualBreakTime);
                              const minutes = Math.round((actualBreakTime - hours) * 60);
                              return `${hours}:${minutes.toString().padStart(2, '0')}`;
                            })()}
                          </span>
                        ) : (
                          <input
                            type="text"
                            value={(() => {
                              const actualBreakTime = result.actualBreakTime || 0;
                              const hours = Math.floor(actualBreakTime);
                              const minutes = Math.round((actualBreakTime - hours) * 60);
                              return `${hours}:${minutes.toString().padStart(2, '0')}`;
                            })()}
                            onChange={(e) => {
                              const timeStr = e.target.value;
                              let newActualBreakTime = 0;
                              
                              if (timeStr.includes(':')) {
                                const parts = timeStr.split(':');
                                const h = parseInt(parts[0]) || 0;
                                const m = parseInt(parts[1]) || 0;
                                newActualBreakTime = h + (m / 60);
                              } else {
                                newActualBreakTime = parseFloat(timeStr) || 0;
                              }
                              
                              const updatedResults = [...comparisonResults];
                              updatedResults[index] = {
                                ...result,
                                actualBreakTime: newActualBreakTime,
                                // actualWorkHours 재계산
                                actualWorkHours: Math.max(0, parseTimeRangeToHours(result.actualTimeRange || '') - newActualBreakTime),
                                isModified: true
                              };
                              setComparisonResults(updatedResults);
                            }}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-center"
                            placeholder="0:30"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        <span className="text-gray-600">
                          {(() => {
                            const actualWorkHours = result.actualWorkHours || 0;
                            const hours = Math.floor(actualWorkHours);
                            const minutes = Math.round((actualWorkHours - hours) * 60);
                            return `${hours}:${minutes.toString().padStart(2, '0')}`;
                          })()}
                        </span>
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
                        {/* 🔥 검토완료가 아니고, 급여확정도 안 되었을 때만 버튼 표시 (시간일치 포함) */}
                        {isEditable && (result.status === 'review_required' || result.status === 'review_completed' || result.status === 'time_match') && !isPayrollConfirmed(selectedEmployeeId) && (
                          <div className="flex space-x-2">
                            {result.status === 'review_completed' ? (
                              // 🔥 검토완료 상태: 확인완료 취소 버튼
                              <button
                                onClick={async () => {
                                  const updatedResults = [...comparisonResults];
                                  updatedResults[index] = {
                                    ...result,
                                    status: 'review_required',
                                    isModified: true
                                  };
                                  setComparisonResults(sortComparisonResults(updatedResults));
                                  
                                  // 🔥 전체 검토완료 여부 확인
                                  const allCompleted = updatedResults.every(r => 
                                    r.status === 'review_completed' || r.status === 'time_match'
                                  );
                                  const finalStatus: '검토전' | '검토중' | '근무시간검토완료' = allCompleted ? '근무시간검토완료' : '검토중';
                                  
                                  setEmployeeReviewStatus(prev => {
                                    const existingIndex = prev.findIndex(status => 
                                      status.employeeId === selectedEmployeeId && status.branchId === selectedBranchId
                                    );
                                    
                                    if (existingIndex >= 0) {
                                      const updated = [...prev];
                                      updated[existingIndex] = { ...updated[existingIndex], status: finalStatus };
                                      return updated;
                                    } else {
                                      return [...prev, { employeeId: selectedEmployeeId, branchId: selectedBranchId, status: finalStatus }];
                                    }
                                  });
                                  
                                  // DB에 저장
                                  await saveModifiedData(updatedResults[index]);
                                  await saveReviewStatus(selectedEmployeeId, finalStatus);
                                }}
                                className="bg-orange-600 text-white px-3 py-1 rounded text-xs hover:bg-orange-700"
                              >
                                확인완료취소
                              </button>
                            ) : (
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
                                  
                                  // 🔥 전체 검토완료 여부 확인
                                  const allCompleted = updatedResults.every(r => 
                                    r.status === 'review_completed' || r.status === 'time_match'
                                  );
                                  const finalStatus: '검토전' | '검토중' | '근무시간검토완료' = allCompleted ? '근무시간검토완료' : '검토중';
                                  
                                  setEmployeeReviewStatus(prev => {
                                    const existingIndex = prev.findIndex(status => 
                                      status.employeeId === selectedEmployeeId && status.branchId === selectedBranchId
                                    );
                                    
                                    if (existingIndex >= 0) {
                                      // 기존 상태 업데이트
                                      const updated = [...prev];
                                      updated[existingIndex] = { ...updated[existingIndex], status: finalStatus };
                                      return updated;
                                    } else {
                                      // 새로운 상태 추가
                                      const newStatus = { employeeId: selectedEmployeeId, branchId: selectedBranchId, status: finalStatus };
                                      return [...prev, newStatus];
                                    }
                                  });
                                  
                                  // DB에 저장
                                  await saveModifiedData(updatedResults[index]);
                                  await saveReviewStatus(selectedEmployeeId, finalStatus);
                                }}
                                className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                              >
                                확인완료
                              </button>
                            )}
                            {result.status === 'review_required' && (
                              <button
                                onClick={async () => {
                                  if (confirm('스케줄 시간을 실제 근무시간으로 복사하시겠습니까?')) {
                                    const updatedResults = [...comparisonResults];
                                    
                                    updatedResults[index] = {
                                      ...result,
                                      actualHours: result.scheduledHours,
                                      actualTimeRange: result.scheduledTimeRange, // actualTimeRange = scheduledTimeRange
                                      actualWorkHours: Math.max(0, parseTimeRangeToHours(result.scheduledTimeRange || '') - (result.actualBreakTime || 0)), // actualTimeRange에서 계산
                                      difference: 0, // 스케줄과 동일하므로 차이 0
                                      // posTimeRange는 변경하지 않음 (POS 원본 데이터 유지)
                                      status: 'review_completed',
                                      isModified: true
                                    };
                                    setComparisonResults(sortComparisonResults(updatedResults));
                                    
                                    // 🔥 전체 검토완료 여부 확인
                                    const allCompleted = updatedResults.every(r => 
                                      r.status === 'review_completed' || r.status === 'time_match'
                                    );
                                    const finalStatus: '검토전' | '검토중' | '근무시간검토완료' = allCompleted ? '근무시간검토완료' : '검토중';
                                    
                                    setEmployeeReviewStatus(prev => {
                                      const existingIndex = prev.findIndex(status => 
                                        status.employeeId === selectedEmployeeId && status.branchId === selectedBranchId
                                      );
                                      
                                      if (existingIndex >= 0) {
                                        // 기존 상태 업데이트
                                        const updated = [...prev];
                                        updated[existingIndex] = { ...updated[existingIndex], status: finalStatus };
                                        return updated;
                                      } else {
                                        // 새로운 상태 추가
                                        const newStatus = { employeeId: selectedEmployeeId, branchId: selectedBranchId, status: finalStatus };
                                        return [...prev, newStatus];
                                      }
                                    });
                                    
                                    // DB에 저장
                                    await saveModifiedData(updatedResults[index]);
                                    await saveReviewStatus(selectedEmployeeId, finalStatus);
                                  }
                                }}
                                className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                              >
                                스케줄시간복사
                              </button>
                            )}
                          </div>
                        )}
                        
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr className="font-semibold">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
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
                      // POS근무시각 합계 - posTimeRange의 시간 계산
                      const totalPosTime = comparisonResults.reduce((sum, result) => {
                        return sum + parseTimeRangeToHours(result.posTimeRange || '');
                      }, 0);
                      const hours = Math.floor(totalPosTime);
                      const minutes = Math.round((totalPosTime - hours) * 60);
                      return `${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      // actualTimeRange의 총 시간 계산 (실근무시각(B) 합계)
                      const totalActualTimeRange = comparisonResults.reduce((sum, result) => {
                        return sum + parseTimeRangeToHours(result.actualTimeRange || '');
                      }, 0);
                      const hours = Math.floor(totalActualTimeRange);
                      const minutes = Math.round((totalActualTimeRange - hours) * 60);
                      return `${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      // 실휴게시간(C) 합계 - actualBreakTime 사용
                      const totalActualBreak = comparisonResults.reduce((sum, result) => sum + (result.actualBreakTime || 0), 0);
                      const hours = Math.floor(totalActualBreak);
                      const minutes = Math.round((totalActualBreak - hours) * 60);
                      return `${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      // 실근무시간 (D=B-C) 합계 - actualWorkHours 사용
                      const totalActualWork = comparisonResults.reduce((sum, result) => sum + (result.actualWorkHours || 0), 0);
                      const hours = Math.floor(totalActualWork);
                      const minutes = Math.round((totalActualWork - hours) * 60);
                      return `${hours}:${minutes.toString().padStart(2, '0')}`;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {(() => {
                      // 차이 (A-D) 합계
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
              <div className="space-y-4">
                {/* 관리자용 메모 */}
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 text-sm">🔒</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">급여메모 (관리자용)</h4>
                    <textarea
                      value={employeeMemos[selectedEmployeeId]?.admin || ''}
                      onChange={(e) => {
                        const memo = e.target.value;
                        setEmployeeMemos(prev => ({
                          ...prev,
                          [selectedEmployeeId]: {
                            ...prev[selectedEmployeeId],
                            admin: memo
                          }
                        }));
                      }}
                      onBlur={(e) => {
                        const memo = e.target.value;
                        saveEmployeeMemo(selectedEmployeeId, memo, 'admin');
                      }}
                      placeholder="관리자용 메모를 입력하세요..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      rows={3}
                    />
                  </div>
                </div>

                {/* 해당직원공지용 메모 */}
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 text-sm">📢</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">급여메모 (해당직원공지용)</h4>
                    <textarea
                      value={employeeMemos[selectedEmployeeId]?.employee || ''}
                      onChange={(e) => {
                        const memo = e.target.value;
                        setEmployeeMemos(prev => ({
                          ...prev,
                          [selectedEmployeeId]: {
                            ...prev[selectedEmployeeId],
                            employee: memo
                          }
                        }));
                      }}
                      onBlur={(e) => {
                        const memo = e.target.value;
                        saveEmployeeMemo(selectedEmployeeId, memo, 'employee');
                      }}
                      placeholder="해당직원공지용 메모를 입력하세요..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        )}

        {comparisonResults.length === 0 && selectedEmployeeId && selectedMonth && selectedBranchId && (
          <div className="px-6 py-12 text-center">
            <div className="text-gray-500 text-lg mb-2">📊</div>
            <div className="text-gray-500 text-lg mb-2">비교결과 데이터 없음</div>
            <div className="text-gray-400 text-sm">
              지점, 월, 직원을 선택하고 실제근무 데이터를 입력한 후<br />
              &quot;근무시간 비교&quot; 버튼을 클릭해주세요.
            </div>
          </div>
        )}
        
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
      </div>
        );
      })()}

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
  );
}
