'use client';

import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import DateInput from './DateInput';
// import html2pdf from 'html2pdf.js'; // 동적 import로 변경

interface Employee {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  residentNumber?: string;
  hireDate?: Date;
  resignationDate?: Date;
  status?: 'active' | 'inactive';
  contractFile?: string; // 근로계약서 파일 URL
  // 급여관리용 은행 정보
  bankName?: string;
  bankCode?: string;
  accountNumber?: string;
  accountHolder?: string; // 예금주명
  // 수습기간 관리
  probationStartDate?: Date; // 수습 시작일
  probationEndDate?: Date; // 수습 종료일
  probationPeriod?: number; // 수습기간 (개월)
  isOnProbation?: boolean; // 현재 수습 중인지 여부
  // 지점 정보 (표시용)
  branchNames?: string[]; // 소속 지점명들
  // 메모
  memo?: string; // 직원 메모
  createdAt: Date;
  updatedAt: Date;
}

interface Branch {
  id: string;
  name: string;
  companyName?: string;
  ceoName?: string;
  businessNumber?: string;
}

interface EmployeeBranch {
  id: string;
  employeeId: string;
  branchId: string;
  branchName: string;
  role: 'main' | 'additional'; // 메인/부가 지점
  startDate: Date; // 해당 지점 근무 시작일
  endDate?: Date; // 해당 지점 근무 종료일 (선택사항)
  isActive: boolean; // 현재 활성 상태
  createdAt: Date;
  updatedAt: Date;
}

interface BankCode {
  id: string;
  name: string;
  code: string;
  createdAt: Date;
}

interface EmploymentContract {
  id: string;
  employeeId: string;
  startDate: Date; // 기준일
  employmentType: string; // 고용형태 ('근로소득', '사업소득', '일용직', '외국인')
  salaryType: 'hourly' | 'monthly'; // 시급/월급 선택
  salaryAmount: number; // 금액
  weeklyWorkHours?: number; // 주간근무시간
  includeHolidayAllowance?: boolean; // 주휴수당 포함 여부 (시급인 경우만)
  contractFile?: string; // 계약 파일 URL
  contractFileName?: string; // 원본 파일명
  fileType?: string; // 파일 타입
  fileSize?: number; // 파일 크기
  isBase64?: boolean; // Base64 저장 여부
  createdAt: Date;
  updatedAt: Date;
}

interface EmployeeManagementProps {
  userBranch?: {
    id: string;
    name: string;
    managerId?: string;
  } | null;
  isManager?: boolean;
}

export default function EmployeeManagement({ userBranch, isManager }: EmployeeManagementProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [bankCodes, setBankCodes] = useState<BankCode[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [contracts, setContracts] = useState<EmploymentContract[]>([]);
  const [contractsKey, setContractsKey] = useState(0); // 강제 리렌더링용
  const [showContractModal, setShowContractModal] = useState(false);
  // 필터링 및 검색 상태
  const [showResignedEmployees, setShowResignedEmployees] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDocumentModal, setShowDocumentModal] = useState<{ show: boolean; employee: Employee | null }>({ show: false, employee: null });
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [contractFormData, setContractFormData] = useState({
    startDate: '',
    employmentType: '',
    salaryType: 'hourly' as 'hourly' | 'monthly',
    salaryAmount: '',
    weeklyWorkHours: '',
    includeHolidayAllowance: false,
    contractFile: ''
  });
  const [editingContract, setEditingContract] = useState<EmploymentContract | null>(null);
  const [showAddContractForm, setShowAddContractForm] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    residentNumber: '',
    hireDate: '',
    resignationDate: '',
    // 급여관리용 은행 정보
    bankName: '',
    bankCode: '',
    accountNumber: '',
    accountHolder: '',
    // 수습기간 관리
    probationStartDate: '',
    probationEndDate: '',
    probationPeriod: 3,
    isOnProbation: false,
    // 메모
    memo: ''
  });
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);

  useEffect(() => {
    console.log('EmployeeManagement 컴포넌트가 마운트되었습니다.');
    loadEmployees();
    loadBranches();
    loadBankCodes();
  }, []);

  useEffect(() => {
    if (isManager && userBranch) {
      setSelectedBranchId(userBranch.id);
      console.log('매니저 권한으로 지점 설정:', userBranch.name);
    }
  }, [isManager, userBranch]);

  // showForm 상태 변화 추적
  useEffect(() => {
    console.log('showForm 상태 변경:', showForm);
    console.log('editingEmployee 상태:', editingEmployee);
  }, [showForm, editingEmployee]);

  // 근로계약정보가 없는 직원 확인
  const hasNoContract = (employeeId: string) => {
    // contracts 배열에서 해당 직원의 계약서가 있는지 확인
    return !contracts.some(contract => contract.employeeId === employeeId);
  };

  const loadEmployees = async () => {
    console.log('직원 목록을 불러오는 중...');
    try {
      // 모든 직원 로드
      const employeesSnapshot = await getDocs(collection(db, 'employees'));
      
      // 직원-지점 관계 로드
      const employeeBranchesSnapshot = await getDocs(collection(db, 'employeeBranches'));
      
      // 지점 목록 로드
      const branchesSnapshot = await getDocs(collection(db, 'branches'));
      const branchesMap = new Map();
      branchesSnapshot.docs.forEach(doc => {
        branchesMap.set(doc.id, doc.data().name);
      });
      
      // 모든 계약서 로드
      const contractsSnapshot = await getDocs(collection(db, 'employmentContracts'));
      const allContracts = contractsSnapshot.docs.map(doc => ({
        id: doc.id,
        employeeId: doc.data().employeeId,
        employmentType: doc.data().employmentType,
        salaryType: doc.data().salaryType,
        salaryAmount: doc.data().salaryAmount,
        weeklyWorkHours: doc.data().weeklyWorkHours,
        startDate: doc.data().startDate?.toDate ? doc.data().startDate.toDate() : new Date(),
        endDate: doc.data().endDate?.toDate ? doc.data().endDate.toDate() : undefined,
        contractFile: doc.data().contractFile,
        contractFileName: doc.data().contractFileName,
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
      }));
      setContracts(allContracts);
      
      // 직원-지점 관계를 Map으로 변환
      const employeeBranchesMap = new Map<string, EmployeeBranch[]>();
      employeeBranchesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const employeeBranch: EmployeeBranch = {
          id: doc.id,
          employeeId: data.employeeId,
          branchId: data.branchId,
          branchName: data.branchName,
          role: data.role || 'main',
          startDate: data.startDate?.toDate ? data.startDate.toDate() : new Date(),
          endDate: data.endDate?.toDate ? data.endDate.toDate() : undefined,
          isActive: data.isActive !== false,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
        
        if (!employeeBranchesMap.has(employeeBranch.employeeId)) {
          employeeBranchesMap.set(employeeBranch.employeeId, []);
        }
        employeeBranchesMap.get(employeeBranch.employeeId)!.push(employeeBranch);
      });
      
      let employeesData = employeesSnapshot.docs.map(doc => {
        const data = doc.data();
        const resignationDate = data.resignationDate?.toDate ? data.resignationDate.toDate() : undefined;
        
        // 직원의 지점명들 가져오기
        const employeeBranchList = employeeBranchesMap.get(doc.id) || [];
        let branchNames: string[] = [];
        
        if (employeeBranchList.length > 0) {
          // 새로운 EmployeeBranch 관계가 있는 경우
          branchNames = employeeBranchList
            .filter(eb => eb.isActive)
            .map(eb => eb.branchName);
        } else {
          // 기존 데이터 호환성 (branchId, branchName 사용)
          if (data.branchId) {
            const branchName = branchesMap.get(data.branchId);
            if (branchName) {
              branchNames = [branchName];
            }
          } else if (data.branchName) {
            branchNames = [data.branchName];
          }
        }
        
        const employee = {
          id: doc.id,
          name: data.name || '',
          userId: data.userId || data.email || '', // 하위 호환성을 위해 email도 확인
          phone: data.phone || '',
          residentNumber: data.residentNumber || '',
          hireDate: data.hireDate?.toDate ? data.hireDate.toDate() : new Date(),
          resignationDate: resignationDate,
          type: data.type || '정규직',
          status: resignationDate ? 'inactive' : 'active', // 퇴사일이 있으면 'inactive', 없으면 'active'
          // 급여관리용 은행 정보
          bankName: data.bankName || '',
          bankCode: data.bankCode || '',
          accountNumber: data.accountNumber || '',
          accountHolder: data.accountHolder || '',
          // 정직원 주간 근무시간
          weeklyWorkHours: data.weeklyWorkHours || 40,
          // 수습기간 관리
          probationStartDate: data.probationStartDate?.toDate ? data.probationStartDate.toDate() : undefined,
          probationEndDate: data.probationEndDate?.toDate ? data.probationEndDate.toDate() : undefined,
          probationPeriod: data.probationPeriod || 3,
          isOnProbation: data.isOnProbation || false,
          // 지점 정보 (표시용)
          branchNames: branchNames,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
        console.log('처리된 직원:', employee);
        return employee;
      }) as Employee[];
      
      // 매니저 권한이 있으면 해당 지점 직원만 필터링
      if (isManager && userBranch) {
        console.log('매니저 권한으로 지점 필터링:', userBranch.id);
        employeesData = employeesData.filter(employee => {
          const employeeBranchList = employeeBranchesMap.get(employee.id) || [];
          return employeeBranchList.some(eb => 
            eb.branchId === userBranch.id && eb.isActive
          );
        });
      }
      
      console.log('처리된 직원 데이터:', employeesData);
      setEmployees(employeesData);
    } catch (error) {
      console.error('직원 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadBranches = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        companyName: doc.data().companyName,
        ceoName: doc.data().ceoName,
        businessNumber: doc.data().businessNumber
      })) as Branch[];
      setBranches(branchesData);
      console.log('지점 데이터 로드됨 (상세 정보 포함):', branchesData);
    } catch (error) {
      console.error('지점 목록을 불러올 수 없습니다:', error);
    }
  };

  const loadBankCodes = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'bankCodes'));
      const bankCodesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        code: doc.data().code,
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
      })) as BankCode[];
      
      // 은행명을 가나다 순으로 정렬
      bankCodesData.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      
      setBankCodes(bankCodesData);
      console.log('은행코드 데이터 로드됨:', bankCodesData);
    } catch (error) {
      console.error('은행코드 목록을 불러올 수 없습니다:', error);
    }
  };

  // 수습기간 계산 함수
  const calculateProbationPeriod = (startDate: string, periodMonths: number) => {
    if (!startDate) return '';
    
    const start = new Date(startDate);
    const end = new Date(start);
    end.setMonth(end.getMonth() + periodMonths);
    
    return end.toISOString().split('T')[0];
  };

  // 수습 중 여부 자동 계산 함수
  const isCurrentlyOnProbation = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return false;
    
    const today = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    return today >= start && today <= end;
  };

  const initializeBankCodes = async () => {
    try {
      console.log('은행코드 초기화 시작...');
      
      // 기존 데이터 확인
      const existingSnapshot = await getDocs(collection(db, 'bankCodes'));
      console.log('기존 은행코드 개수:', existingSnapshot.docs.length);
      
      if (existingSnapshot.docs.length > 0) {
        console.log('기존 은행코드 데이터가 있습니다. 삭제 후 새로 추가합니다.');
        
        // 기존 데이터 삭제
        for (const docSnapshot of existingSnapshot.docs) {
          await deleteDoc(doc(db, 'bankCodes', docSnapshot.id));
        }
      }
      
      // 새 데이터 추가
      const bankCodesData = [
        { name: '국민은행', code: '004' },
        { name: '신한은행', code: '088' },
        { name: '우리은행', code: '020' },
        { name: '하나은행', code: '081' },
        { name: '농협은행', code: '011' },
        { name: '기업은행', code: '003' },
        { name: '카카오뱅크', code: '090' },
        { name: '케이뱅크', code: '089' },
        { name: 'SC제일은행', code: '023' },
        { name: '한국씨티은행', code: '027' },
        { name: '부산은행', code: '032' },
        { name: '대구은행', code: '031' },
        { name: '경남은행', code: '039' },
        { name: '광주은행', code: '034' },
        { name: '전북은행', code: '037' },
        { name: '제주은행', code: '035' },
        { name: '수협은행', code: '007' },
        { name: '우체국', code: '071' },
        { name: '새마을금고', code: '045' },
        { name: '신협', code: '048' },
        { name: '산업은행', code: '002' },
        { name: '한국은행', code: '001' },
        { name: '저축은행중앙회', code: '050' },
        { name: 'HSBC은행', code: '054' },
        { name: '도이치은행', code: '055' }
      ];
      
      const promises = bankCodesData.map(async (bankCode) => {
        const docRef = await addDoc(collection(db, 'bankCodes'), {
          ...bankCode,
          createdAt: new Date()
        });
        console.log(`은행코드 추가됨: ${bankCode.name} (${bankCode.code}) - ID: ${docRef.id}`);
        return docRef;
      });
      
      await Promise.all(promises);
      console.log('모든 은행코드가 성공적으로 추가되었습니다!');
      
      // 데이터 다시 로드
      await loadBankCodes();
      alert('은행코드가 성공적으로 초기화되었습니다!');
      
    } catch (error) {
      console.error('은행코드 초기화 중 오류:', error);
      alert('은행코드 초기화 중 오류가 발생했습니다.');
    }
  };

  // 근무이력이 있는지 확인
  const hasWorkHistory = async (employeeId: string): Promise<boolean> => {
    try {
      const schedulesQuery = query(
        collection(db, 'schedules'),
        where('employeeId', '==', employeeId)
      );
      const querySnapshot = await getDocs(schedulesQuery);
      return !querySnapshot.empty;
    } catch (error) {
      console.error('근무이력 확인 중 오류:', error);
      return false;
    }
  };

  // 재직증명서 PDF 생성
  const generateEmploymentCertificate = async (employee: Employee) => {
    console.log('재직증명서 생성 시작:', employee);
    
    // 지점 정보 기본값 설정
    let branchInfo = {
      companyName: '카페드로잉 석촌호수점', // 기본 회사명
      ceoName: '이진영', // 기본 대표자명
      businessNumber: '522-27-02034', // 기본 사업자등록번호
      name: '카페드로잉 석촌호수점' // 기본 지점명
    };
    
    try {
      // 먼저 branches 데이터가 있는지 확인
      console.log('현재 branches 데이터:', branches);
      
      // 직원-지점 관계 조회
      const employeeBranchesSnapshot = await getDocs(
        query(collection(db, 'employeeBranches'), where('employeeId', '==', employee.id))
      );
      
      console.log('직원-지점 관계 데이터:', employeeBranchesSnapshot.docs.map(doc => doc.data()));
      
      if (!employeeBranchesSnapshot.empty) {
        const firstBranch = employeeBranchesSnapshot.docs[0].data();
        console.log('첫 번째 지점 관계:', firstBranch);
        
        // 직접 DB에서 지점 정보 조회 (더 확실한 방법)
        const branchDoc = await getDocs(query(collection(db, 'branches'), where('__name__', '==', firstBranch.branchId)));
        if (!branchDoc.empty) {
          const branchData = branchDoc.docs[0].data();
          console.log('DB에서 직접 조회한 지점 데이터:', branchData);
          
          branchInfo = {
            companyName: branchData.companyName || branchData.name || '카페드로잉 석촌호수점',
            ceoName: branchData.ceoName || '이진영',
            businessNumber: branchData.businessNumber || '522-27-02034',
            name: branchData.name || '카페드로잉 석촌호수점'
          };
        }
        
        // branches 배열에서도 확인 (이중 체크)
        const employeeBranch = branches.find(branch => branch.id === firstBranch.branchId);
        console.log('branches 배열에서 찾은 지점 정보:', employeeBranch);
        
        if (employeeBranch && (employeeBranch.companyName || employeeBranch.ceoName || employeeBranch.businessNumber)) {
          branchInfo = {
            companyName: employeeBranch.companyName || employeeBranch.name || branchInfo.companyName,
            ceoName: employeeBranch.ceoName || branchInfo.ceoName,
            businessNumber: employeeBranch.businessNumber || branchInfo.businessNumber,
            name: employeeBranch.name || branchInfo.name
          };
        }
      }
    } catch (error) {
      console.error('직원 지점 정보 조회 중 오류:', error);
    }
    
    console.log('최종 branchInfo:', branchInfo);
    
    // HTML 템플릿 생성
    const htmlContent = `
      <div style="font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; background: white; color: black;">
        <h1 style="text-align: center; font-size: 28px; font-weight: bold; margin-bottom: 40px; color: black;">재직증명서</h1>
        
        <div style="margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; background: #f9f9f9;">
          <p style="margin: 8px 0; font-size: 16px; color: black;"><strong>회사명:</strong> ${branchInfo.companyName}</p>
          <p style="margin: 8px 0; font-size: 16px; color: black;"><strong>대표자:</strong> ${branchInfo.ceoName}</p>
          <p style="margin: 8px 0; font-size: 16px; color: black;"><strong>사업자등록번호:</strong> ${branchInfo.businessNumber}</p>
        </div>
        
        <div style="margin-bottom: 30px; padding: 20px; border: 1px solid #ddd;">
          <p style="margin: 10px 0; font-size: 16px; color: black;"><strong>성명:</strong> ${employee.name || '직원명 없음'}</p>
          <p style="margin: 10px 0; font-size: 16px; color: black;"><strong>주민등록번호:</strong> ${employee.residentNumber || '정보 없음'}</p>
          <p style="margin: 10px 0; font-size: 16px; color: black;"><strong>입사일:</strong> ${employee.hireDate ? employee.hireDate.toLocaleDateString('ko-KR') : '정보 없음'}</p>
          <p style="margin: 10px 0; font-size: 16px; color: black;"><strong>퇴사일:</strong> ${employee.resignationDate ? employee.resignationDate.toLocaleDateString('ko-KR') : '재직중'}</p>
          <p style="margin: 10px 0; font-size: 16px; color: black;"><strong>지점:</strong> ${branchInfo.name}</p>
        </div>
        
        <div style="margin: 40px 0; text-align: center;">
          <p style="font-size: 18px; line-height: 1.6; color: black; font-weight: bold;">위의 사람이 위 회사에서 위와 같이 근무하고 있음을 증명합니다.</p>
        </div>
        
        <div style="margin-bottom: 30px; text-align: right;">
          <p style="margin: 5px 0; font-size: 16px; color: black;"><strong>발급일:</strong> ${new Date().toLocaleDateString('ko-KR')}</p>
        </div>
        
        <div style="margin-top: 50px; text-align: right; padding: 20px; border: 1px solid #ddd; background: #f9f9f9;">
          <p style="margin: 8px 0; font-size: 18px; color: black; font-weight: bold;">${branchInfo.companyName}</p>
          <p style="margin: 8px 0; font-size: 16px; color: black;"><strong>대표자:</strong> ${branchInfo.ceoName} (인)</p>
        </div>
      </div>
    `;
    
    console.log('생성된 HTML 내용:', htmlContent);
    
    // PDF 생성 및 다운로드 (다중 방법 시도)
    try {
      console.log('PDF 생성 시작...');
      
      // 방법 1: jsPDF + html2canvas 조합 시도
      try {
        console.log('방법 1: jsPDF + html2canvas 시도...');
        
        const jsPDF = (await import('jspdf')).default;
        const html2canvas = (await import('html2canvas')).default;
        
        // 임시 div 생성
        const element = document.createElement('div');
        element.innerHTML = htmlContent;
        element.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 800px;
          background: white;
          font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif;
          color: black;
          z-index: 9999;
          padding: 40px;
        `;
        document.body.appendChild(element);
        
        // HTML을 캔버스로 변환
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          width: 800,
          height: 1000
        });
        
        // 캔버스를 PDF로 변환
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const imgWidth = 190; // A4 width in mm minus margins
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        
        let position = 10; // top margin
        
        // 첫 페이지 추가
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        // 여러 페이지가 필요한 경우 추가 페이지 생성
        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        
        // PDF 다운로드
        pdf.save(`${employee.name}_재직증명서_${new Date().toISOString().split('T')[0]}.pdf`);
        
        // 임시 div 제거
        if (document.body.contains(element)) {
          document.body.removeChild(element);
        }
        
        console.log('jsPDF + html2canvas 방법으로 PDF 생성 완료');
        alert('재직증명서가 성공적으로 생성되었습니다.');
        return; // 성공 시 함수 종료
        
      } catch (jsPdfError) {
        console.log('jsPDF 방법 실패, html2pdf.js 시도...', jsPdfError);
        
        // 방법 2: 기존 html2pdf.js 시도
        const html2pdf = await import('html2pdf.js');
        console.log('html2pdf 라이브러리 로드 완료');
        
        // PDF 생성 옵션
        const opt = {
          margin: [10, 10, 10, 10],
          filename: `${employee.name}_재직증명서_${new Date().toISOString().split('T')[0]}.pdf`,
          image: { 
            type: 'jpeg', 
            quality: 0.98 
          },
          html2canvas: { 
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            letterRendering: true,
            logging: true
          },
          jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait'
          }
        };
        
        // 임시 div 생성
        const element = document.createElement('div');
        element.innerHTML = htmlContent;
        element.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 800px;
          background: white;
          font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif;
          color: black;
          z-index: 9999;
          visibility: visible;
        `;
        document.body.appendChild(element);
        
        console.log('html2pdf로 PDF 생성 시도...');
        await html2pdf.default().set(opt).from(element).save();
        
        // 임시 div 제거
        if (document.body.contains(element)) {
          document.body.removeChild(element);
        }
        
        console.log('html2pdf로 PDF 생성 완료');
        alert('재직증명서가 성공적으로 생성되었습니다.');
      }
      
    } catch (error) {
      console.error('PDF 생성 중 오류:', error);
      if (error instanceof Error) {
        console.error('오류 상세:', error.stack);
      }
      
      // 대안: 새 창에서 인쇄 가능한 페이지 열기
      try {
        const printWindow = window.open('', '_blank', 'width=800,height=1000');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${employee.name} 재직증명서</title>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                  font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; 
                  background: white; 
                  color: black;
                  padding: 20px;
                }
                @media print {
                  body { margin: 0; padding: 20px; }
                  @page { 
                    margin: 20mm; 
                    size: A4;
                  }
                }
                .no-print { display: none; }
                @media print {
                  .no-print { display: none !important; }
                }
              </style>
            </head>
            <body>
              <div class="no-print" style="text-align: center; margin-bottom: 20px; padding: 10px; background: #f0f0f0; border: 1px solid #ccc;">
                <p><strong>PDF 생성에 실패하여 인쇄 창을 열었습니다.</strong></p>
                <p>Ctrl+P를 눌러 인쇄하거나 브라우저의 인쇄 기능을 사용해 PDF로 저장하세요.</p>
                <button onclick="window.print()" style="margin: 10px; padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">인쇄하기</button>
                <button onclick="window.close()" style="margin: 10px; padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">닫기</button>
              </div>
              ${htmlContent}
            </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.focus();
          
          alert('PDF 생성에 실패했습니다. 새 창에서 인쇄 기능을 사용해 PDF로 저장하세요.');
        } else {
          alert('PDF 생성 및 인쇄 창 열기에 실패했습니다. 팝업 차단을 해제하고 다시 시도해주세요.');
        }
      } catch (printError) {
        console.error('인쇄 창 열기 실패:', printError);
        alert('PDF 생성에 실패했습니다. 브라우저 설정을 확인하고 다시 시도해주세요.');
      }
    }
  };

  // 직원-지점 관계 생성
  const createEmployeeBranches = async (employeeId: string, branchIds: string[]) => {
    try {
      for (let i = 0; i < branchIds.length; i++) {
        const branchId = branchIds[i];
        const branch = branches.find(b => b.id === branchId);
        if (!branch) continue;

        const employeeBranchData = {
          employeeId: employeeId,
          branchId: branchId,
          branchName: branch.name,
          role: i === 0 ? 'main' : 'additional', // 첫 번째 지점을 메인으로 설정
          startDate: new Date(),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await addDoc(collection(db, 'employeeBranches'), employeeBranchData);
      }
    } catch (error) {
      console.error('직원-지점 관계 생성 중 오류:', error);
      throw error;
    }
  };

  // 직원-지점 관계 업데이트
  const updateEmployeeBranches = async (employeeId: string, branchIds: string[]) => {
    try {
      // 기존 관계 삭제
      const existingRelations = await getDocs(
        query(collection(db, 'employeeBranches'), where('employeeId', '==', employeeId))
      );
      
      for (const docSnapshot of existingRelations.docs) {
        await deleteDoc(doc(db, 'employeeBranches', docSnapshot.id));
      }

      // 새로운 관계 생성
      await createEmployeeBranches(employeeId, branchIds);
    } catch (error) {
      console.error('직원-지점 관계 업데이트 중 오류:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('직원 폼 제출됨:', formData);

    // 필수입력 검증
    if (!formData.name.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }
    if (selectedBranches.length === 0) {
      alert('최소 하나의 지점을 선택해주세요.');
      return;
    }

    try {
      if (editingEmployee) {
        // 수정
        console.log('직원 수정 시도:', editingEmployee.id);
        
        if (!editingEmployee.id) {
          throw new Error('직원 ID가 없습니다.');
        }
        
        const employeeRef = doc(db, 'employees', editingEmployee.id);
        console.log('문서 참조:', employeeRef);
        
        const updateData: Record<string, unknown> = {
          ...formData,
          hireDate: formData.hireDate ? new Date(formData.hireDate) : new Date(),
          updatedAt: new Date()
        };
        
        // undefined 값들을 제거하고 유효한 값만 추가
        if (formData.probationStartDate) {
          updateData.probationStartDate = new Date(formData.probationStartDate);
        }
        if (formData.probationEndDate) {
          updateData.probationEndDate = new Date(formData.probationEndDate);
        }
        
        console.log('업데이트할 데이터:', updateData);
        
        await updateDoc(employeeRef, updateData);
        
        // 직원-지점 관계 업데이트
        await updateEmployeeBranches(editingEmployee.id, selectedBranches);
        
        console.log('직원 정보가 수정되었습니다.');
      } else {
        // 추가
        console.log('새 직원 추가 시도');
        console.log('formData:', formData);
        
        const employeeData: Record<string, unknown> = {
          name: formData.name,
          phone: formData.phone || '',
          residentNumber: formData.residentNumber || '',
          hireDate: formData.hireDate ? new Date(formData.hireDate) : new Date(),
          // 급여관리용 은행 정보
          bankName: formData.bankName || '',
          bankCode: formData.bankCode || '',
          accountNumber: formData.accountNumber || '',
          accountHolder: formData.accountHolder || '',
          // 수습기간 관리
          probationPeriod: formData.probationPeriod || 3,
          isOnProbation: formData.isOnProbation || false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // undefined 값들을 제거하고 유효한 값만 추가
        if (formData.probationStartDate) {
          employeeData.probationStartDate = new Date(formData.probationStartDate);
        }
        if (formData.probationEndDate) {
          employeeData.probationEndDate = new Date(formData.probationEndDate);
        }
        
        console.log('저장할 데이터:', employeeData);
        
        const docRef = await addDoc(collection(db, 'employees'), employeeData);
        console.log('새 직원이 추가되었습니다. ID:', docRef.id);
        
        // 직원-지점 관계 생성
        await createEmployeeBranches(docRef.id, selectedBranches);
        
        // 직원 추가 성공 안내
        alert(`직원이 성공적으로 추가되었습니다!\n\n⚠️ 안내: 직원 추가 후, 해당 직원의 근로계약을 직원 목록의 근로계약관리에서 추가해주세요!`);
      }

      // 폼 초기화
      setFormData({
        name: '',
        phone: '',
        email: '',
        residentNumber: '',
        hireDate: '',
        resignationDate: '',
        // 급여관리용 은행 정보
        bankName: '',
        bankCode: '',
        accountNumber: '',
        accountHolder: '',
        // 수습기간 관리
        probationStartDate: '',
        probationEndDate: '',
        probationPeriod: 3,
        isOnProbation: false,
        // 메모
        memo: ''
      });
      setSelectedBranches([]);
      setShowForm(false);
      setEditingEmployee(null);
      
      // 목록 새로고침
      await loadEmployees();
    } catch (error) {
      console.error('직원 정보 저장 중 오류가 발생했습니다:', error);
      console.error('오류 상세:', error);
      alert('직원 정보 저장 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
    }
  };

  const handleEdit = async (employee: Employee) => {
    console.log('=== 직원 수정 시작 ===');
    console.log('직원 데이터:', employee);
    console.log('직원 ID:', employee.id);
    console.log('현재 showForm 상태:', showForm);
    console.log('현재 editingEmployee 상태:', editingEmployee);
    
    if (!employee.id) {
      console.error('직원 ID가 없습니다:', employee);
      alert('직원 ID가 없어서 수정할 수 없습니다.');
      return;
    }
    
    // 직원의 지점 정보 로드
    try {
      const employeeBranchesSnapshot = await getDocs(
        query(collection(db, 'employeeBranches'), where('employeeId', '==', employee.id))
      );
      
      let employeeBranchIds: string[] = [];
      
      if (!employeeBranchesSnapshot.empty) {
        // 새로운 EmployeeBranch 관계가 있는 경우
        employeeBranchIds = employeeBranchesSnapshot.docs.map(doc => doc.data().branchId);
      } else {
        // 기존 데이터 호환성 (branchId 사용)
        // Employee 인터페이스에서 branchId를 제거했으므로, 원본 데이터에서 직접 가져와야 함
        const employeeDoc = await getDocs(collection(db, 'employees'));
        const employeeData = employeeDoc.docs.find(doc => doc.id === employee.id)?.data();
        
        if (employeeData?.branchId) {
          employeeBranchIds = [employeeData.branchId];
        }
      }
      
      setSelectedBranches(employeeBranchIds);
      console.log('직원의 지점 ID들:', employeeBranchIds);
    } catch (error) {
      console.error('직원 지점 정보 로드 중 오류:', error);
      setSelectedBranches([]);
    }
    
    // 상태를 한 번에 업데이트
    console.log('상태 업데이트 시작...');
    setEditingEmployee(employee);
    setFormData({
      name: employee.name || '',
      phone: employee.phone || '',
      email: employee.email || '',
      residentNumber: employee.residentNumber || '',
      hireDate: employee.hireDate ? employee.hireDate.toISOString().split('T')[0] : '',
      // 급여관리용 은행 정보
      bankName: employee.bankName || '',
      bankCode: employee.bankCode || '',
      accountNumber: employee.accountNumber || '',
      accountHolder: employee.accountHolder || '',
      // 수습기간 관리
      probationStartDate: employee.probationStartDate ? employee.probationStartDate.toISOString().split('T')[0] : '',
      probationEndDate: employee.probationEndDate ? employee.probationEndDate.toISOString().split('T')[0] : '',
      probationPeriod: employee.probationPeriod || 3,
      isOnProbation: employee.isOnProbation || false,
      // 메모
      memo: employee.memo || '',
      // 퇴사일
      resignationDate: employee.resignationDate ? employee.resignationDate.toISOString().split('T')[0] : ''
    });
    setShowForm(true);
    
    console.log('상태 업데이트 완료');
    console.log('=== 직원 수정 설정 완료 ===');
  };

  const handleDelete = async (employeeId: string) => {
    const hasHistory = await hasWorkHistory(employeeId);
    
    if (hasHistory) {
      alert('근무이력이 있는 직원은 삭제할 수 없습니다. 퇴사 처리해주세요.');
      return;
    }
    
    if (confirm('정말로 이 직원을 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'employees', employeeId));
        console.log('직원이 삭제되었습니다.');
        await loadEmployees();
      } catch (error) {
        console.error('직원 삭제 중 오류가 발생했습니다:', error);
      }
    }
  };

  const handleDeactivate = async (employeeId: string) => {
    const resignationDate = prompt('퇴사일을 입력해주세요 (YYYY-MM-DD 형식):');
    
    if (!resignationDate) {
      return;
    }
    
    // 날짜 형식 검증
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(resignationDate)) {
      alert('올바른 날짜 형식이 아닙니다. (YYYY-MM-DD)');
      return;
    }
    
    if (confirm('이 직원을 퇴사 처리하시겠습니까?')) {
      try {
        const employeeRef = doc(db, 'employees', employeeId);
        await updateDoc(employeeRef, {
          resignationDate: new Date(resignationDate),
          updatedAt: new Date()
        });
        console.log('직원이 퇴사 처리되었습니다.');
        await loadEmployees();
      } catch (error) {
        console.error('퇴사 처리 중 오류가 발생했습니다:', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      residentNumber: '',
      hireDate: '',
      resignationDate: '',
      // 급여관리용 은행 정보
      bankName: '',
      bankCode: '',
      accountNumber: '',
      accountHolder: '',
      // 수습기간 관리
      probationStartDate: '',
      probationEndDate: '',
      probationPeriod: 3,
      isOnProbation: false,
      // 메모
      memo: ''
    });
    
    // 지점 매니저인 경우 자신의 지점을 기본으로 선택
    if (isManager && userBranch) {
      setSelectedBranches([userBranch.id]);
    } else {
      setSelectedBranches([]);
    }
    
    setEditingEmployee(null);
    setShowForm(false);
  };

  // 이름 정렬 함수
  const handleSort = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  // 근무일수 계산 함수
  const calculateWorkDays = (hireDate: Date, resignationDate?: Date) => {
    const endDate = resignationDate || new Date();
    const startDate = new Date(hireDate);
    
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const years = Math.floor(diffDays / 365);
    const days = diffDays % 365;
    
    if (years > 0) {
      return `${years}년 ${days}일`;
    } else {
      return `${days}일`;
    }
  };

  // 근로계약서 목록 로드
  const loadContracts = async (employeeId: string) => {
    try {
      console.log('=== 근로계약서 로드 시작 ===');
      console.log('직원 ID:', employeeId);
      
      const contractsRef = collection(db, 'employmentContracts');
      const q = query(contractsRef, where('employeeId', '==', employeeId));
      const querySnapshot = await getDocs(q);
      
      console.log('쿼리 결과 문서 수:', querySnapshot.docs.length);
      
      const contractsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('계약서 문서 데이터:', {
          id: doc.id,
          employeeId: data.employeeId,
          contractFileName: data.contractFileName,
          startDate: data.startDate,
          fileSize: data.fileSize,
          isBase64: data.isBase64
        });
        
        return {
          id: doc.id,
          employeeId: data.employeeId,
          startDate: data.startDate?.toDate ? data.startDate.toDate() : new Date(),
          employmentType: data.employmentType || data.contractType || '사업소득', // 기존 contractType을 employmentType으로 매핑
          salaryType: data.salaryType || 'hourly', // 기본값 시급
          salaryAmount: data.salaryAmount || data.salary || 0, // 기존 salary를 salaryAmount로 매핑
          weeklyWorkHours: data.weeklyWorkHours,
          includeHolidayAllowance: data.includeHolidayAllowance || false,
          contractFile: data.contractFile || '',
          contractFileName: data.contractFileName || '',
          fileType: data.fileType || '',
          fileSize: data.fileSize || 0,
          isBase64: data.isBase64 || false,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
      });
      
      const sortedContracts = contractsData.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
      console.log('정렬된 계약서 목록:', sortedContracts);
      console.log('setContracts 호출 전 현재 contracts 길이:', contracts.length);
      
      // 상태 직접 업데이트
      setContracts(sortedContracts);
      setContractsKey(prev => prev + 1);
      console.log('setContracts 호출 완료, 새로운 길이:', sortedContracts.length);
    } catch (error) {
      console.error('근로계약서 로드 중 오류:', error);
    }
  };


  // 근로계약서 파일 업로드
  const handleContractUpload = async (e: React.ChangeEvent<HTMLInputElement>, employee: Employee) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 크기 체크 (500KB)
    if (file.size > 500 * 1024) {
      alert('파일 크기가 너무 큽니다. 500KB 이하의 파일로 업로드해주세요.\n\n현재 파일 크기: ' + (file.size / 1024).toFixed(0) + 'KB');
      return;
    }

    try {
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const fileName = `contracts/${employee.id}_${timestamp}.${fileExtension}`;
      
      // Firebase Storage에 업로드
      const storageRef = ref(storage, fileName);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      // 직원 정보에 계약서 파일 URL 업데이트
      const employeeRef = doc(db, 'employees', employee.id);
      await updateDoc(employeeRef, {
        contractFile: downloadURL,
        updatedAt: new Date()
      });
      
      // 로컬 상태 업데이트
      setEmployees(prev => prev.map(emp => 
        emp.id === employee.id 
          ? { ...emp, contractFile: downloadURL }
          : emp
      ));
      
      // 문서 모달 상태 업데이트
      setShowDocumentModal(prev => ({
        ...prev,
        employee: prev.employee ? { ...prev.employee, contractFile: downloadURL } : null
      }));
      
      alert('계약서 파일이 업로드되었습니다.');
      
      // 파일 입력 필드 초기화
      e.target.value = '';
    } catch (error) {
      console.error('파일 업로드 중 오류:', error);
      alert('파일 업로드에 실패했습니다.');
    }
  };

  // 근로계약서 파일 삭제
  const handleDeleteContract = async (employee: Employee) => {
    if (!employee.contractFile) return;
    
    if (!confirm('정말로 이 계약서 파일을 삭제하시겠습니까?')) {
      return;
    }
    
    try {
      // Firebase Storage에서 파일 삭제
      const fileRef = ref(storage, employee.contractFile);
      await deleteObject(fileRef);
      
      // 직원 정보에서 계약서 파일 URL 제거
      const employeeRef = doc(db, 'employees', employee.id);
      await updateDoc(employeeRef, {
        contractFile: '',
        updatedAt: new Date()
      });
      
      // 로컬 상태 업데이트
      setEmployees(prev => prev.map(emp => 
        emp.id === employee.id 
          ? { ...emp, contractFile: undefined }
          : emp
      ));
      
      // 문서 모달 상태 업데이트
      setShowDocumentModal(prev => ({
        ...prev,
        employee: prev.employee ? { ...prev.employee, contractFile: undefined } : null
      }));
      
      alert('계약서 파일이 삭제되었습니다.');
    } catch (error) {
      console.error('파일 삭제 중 오류:', error);
      alert('파일 삭제에 실패했습니다.');
    }
  };

  // 기준일 중복 체크
  const checkDuplicateStartDate = async (startDate: string, excludeId?: string): Promise<boolean> => {
    try {
      const currentEmployee = showDocumentModal.employee;
      if (!currentEmployee) {
        console.error('직원 정보가 없습니다.');
        return false;
      }
      
      const contractsRef = collection(db, 'employmentContracts');
      const q = query(contractsRef, where('employeeId', '==', currentEmployee.id));
      const querySnapshot = await getDocs(q);
      
      const targetDate = new Date(startDate);
      const duplicateExists = querySnapshot.docs.some(doc => {
        if (excludeId && doc.id === excludeId) return false; // 수정 시 자기 자신 제외
        const docDate = doc.data().startDate?.toDate();
        return docDate && docDate.toDateString() === targetDate.toDateString();
      });
      
      return duplicateExists;
    } catch (error) {
      console.error('기준일 중복 체크 중 오류:', error);
      return false;
    }
  };

  // 근로계약 추가/수정
  const handleContractSubmit = async (e: React.FormEvent) => {
    console.log('handleContractSubmit 호출됨');
    
    const currentEmployee = showDocumentModal.employee;
    if (!currentEmployee) {
      console.log('currentEmployee가 없음');
      alert('직원을 선택해주세요.');
      return;
    }
    
    if (!contractFormData.startDate) {
      alert('기준일을 입력해주세요.');
      return;
    }
    
    // 기준일 중복 체크
    const isDuplicate = await checkDuplicateStartDate(contractFormData.startDate, editingContract?.id);
    if (isDuplicate) {
      alert('이미 동일한 기준일의 근로계약이 존재합니다.\n다른 기준일을 선택해주세요.');
      return;
    }
    
    if (!contractFormData.employmentType) {
      alert('고용형태를 선택해주세요.');
      return;
    }
    
    const salaryAmount = unformatNumber(contractFormData.salaryAmount);
    if (!salaryAmount || parseFloat(salaryAmount) <= 0) {
      alert('금액을 입력해주세요.');
      return;
    }
    
    try {
      setUploadingFile(true);
      
      const contractData: Record<string, unknown> = {
        employeeId: currentEmployee.id,
        startDate: new Date(contractFormData.startDate),
        employmentType: contractFormData.employmentType,
        salaryType: contractFormData.salaryType,
        salaryAmount: parseFloat(contractFormData.salaryAmount),
        contractFile: contractFormData.contractFile,
        updatedAt: new Date()
      };
      
      // weeklyWorkHours는 근로소득, 사업소득인 경우에 추가 (기본값 40)
      if (contractFormData.employmentType === '근로소득' || contractFormData.employmentType === '사업소득') {
        contractData.weeklyWorkHours = contractFormData.weeklyWorkHours ? parseFloat(contractFormData.weeklyWorkHours) : 40;
      }
      
      // includeHolidayAllowance는 시급인 경우에만 추가
      if (contractFormData.salaryType === 'hourly') {
        contractData.includeHolidayAllowance = contractFormData.includeHolidayAllowance;
      }
      
      let contractId: string;
      
      if (editingContract) {
        // 수정
        const contractRef = doc(db, 'employmentContracts', editingContract.id);
        await updateDoc(contractRef, contractData);
        contractId = editingContract.id;
      } else {
        // 추가
        const docRef = await addDoc(collection(db, 'employmentContracts'), {
          ...contractData,
          createdAt: new Date()
        });
        contractId = docRef.id;
      }
      
      // 파일이 선택된 경우 업로드
      if (selectedFile) {
        await handleFileUpload(selectedFile, contractId);
      }
      
      await loadContracts(currentEmployee.id);
      resetContractForm();
    } catch (error) {
      console.error('근로계약 저장 중 오류:', error);
      alert('근로계약 저장에 실패했습니다.');
    } finally {
      setUploadingFile(false);
    }
  };

  // 근로계약 수정
  const handleContractEdit = (contract: EmploymentContract) => {
    setEditingContract(contract);
    setShowAddContractForm(false);
    setContractFormData({
      startDate: contract.startDate.toISOString().split('T')[0],
      employmentType: contract.employmentType || '',
      salaryType: contract.salaryType || 'hourly',
      salaryAmount: contract.salaryAmount ? contract.salaryAmount.toString() : '',
      weeklyWorkHours: contract.weeklyWorkHours ? contract.weeklyWorkHours.toString() : '',
      includeHolidayAllowance: contract.includeHolidayAllowance || false,
      contractFile: contract.contractFile || ''
    });
  };

  // 근로계약서 삭제
  const handleContractDelete = async (contractId: string) => {
    if (confirm('정말로 이 근로계약서를 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'employmentContracts', contractId));
        if (selectedEmployee) {
          await loadContracts(selectedEmployee.id);
        }
      } catch (error) {
        console.error('근로계약서 삭제 중 오류:', error);
      }
    }
  };

  // 숫자 포맷팅 함수 (쉼표 추가)
  const formatNumber = (value: string) => {
    const number = value.replace(/[^\d]/g, '');
    return number.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // 숫자 포맷팅 해제 함수 (쉼표 제거)
  const unformatNumber = (value: string) => {
    return value.replace(/,/g, '');
  };

  // 근로계약 폼 리셋
  const resetContractForm = () => {
    console.log('resetContractForm 호출됨');
    setContractFormData({
      startDate: '',
      employmentType: '',
      salaryType: 'hourly' as 'hourly' | 'monthly',
      salaryAmount: '',
      weeklyWorkHours: '',
      includeHolidayAllowance: false,
      contractFile: ''
    });
    setEditingContract(null);
    setShowAddContractForm(false);
    setSelectedFile(null);
    console.log('resetContractForm 완료 - showAddContractForm: false, editingContract: null');
  };

  // 파일 업로드 (CORS 문제 해결을 위해 Base64 우선 사용)
  const handleFileUpload = async (file: File, contractId: string) => {
    try {
      
      // 파일 크기 및 형식 검증
      const maxSize = 1 * 1024 * 1024; // 1MB
      if (file.size > maxSize) {
        alert('파일 크기가 너무 큽니다. 1MB 이하의 파일로 업로드해주세요.\n\n현재 파일 크기: ' + (file.size / 1024 / 1024).toFixed(1) + 'MB');
        return;
      }
      
      const allowedTypes = [
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 
        'image/jpg',
        'image/png'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        alert('지원되는 파일 형식: PDF, DOC, DOCX, JPG, PNG');
        return;
      }
      
      console.log('파일 업로드 시작:', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        contractId
      });
      
      // CORS 문제 회피를 위해 Base64 방식을 우선 사용
      if (file.size <= 1 * 1024 * 1024) { // 1MB 이하는 Base64로 처리
        console.log('Base64 방식으로 파일 저장 시도...');
        
        try {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          
          const base64Data = await base64Promise;
          console.log('Base64 변환 완료, 크기:', base64Data.length);
          
          // Firestore에 Base64 데이터 저장
          const contractRef = doc(db, 'employmentContracts', contractId);
          await updateDoc(contractRef, {
            contractFile: base64Data,
            contractFileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            isBase64: true,
            updatedAt: new Date()
          });
          
          console.log('Base64 방식으로 파일 저장 완료');
        } catch (base64Error) {
          console.error('Base64 변환 또는 Firestore 저장 실패:', base64Error);
          console.error('에러 상세:', base64Error);
          
          // Firestore 문서 크기 제한 에러인지 확인
          if (base64Error instanceof Error && base64Error.message.includes('maximum size')) {
            throw new Error('파일이 너무 큽니다. 더 작은 파일로 시도해주세요.');
          } else {
            throw new Error('파일 처리 중 오류가 발생했습니다. 파일 크기를 줄이고 다시 시도해주세요.');
          }
        }
      } else {
        // 3MB 이상은 Firebase Storage 시도 (CORS 에러 가능성 높음)
        console.log('대용량 파일, Firebase Storage 시도...');
        
        try {
          const timestamp = Date.now();
          const fileExtension = file.name.split('.').pop();
          const fileName = `contracts/${contractId}_${timestamp}.${fileExtension}`;
          const storageRef = ref(storage, fileName);
          
          const metadata = { contentType: file.type };
          const snapshot = await uploadBytes(storageRef, file, metadata);
          const downloadURL = await getDownloadURL(snapshot.ref);
          
          // Firestore에 파일 정보 업데이트
          const contractRef = doc(db, 'employmentContracts', contractId);
          await updateDoc(contractRef, {
            contractFile: downloadURL,
            contractFileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            isBase64: false,
            updatedAt: new Date()
          });
          
          console.log('Firebase Storage 방식으로 파일 저장 완료');
        } catch (storageError) {
          console.error('Firebase Storage 실패:', storageError);
          throw new Error('파일이 너무 큽니다. 3MB 이하로 줄여주세요.');
        }
      }
      
      // 파일 선택 초기화
      setSelectedFile(null);
      setContractFormData(prev => ({ ...prev, contractFile: '' }));
      
      // 파일 input 필드 초기화
      const fileInputs = document.querySelectorAll('input[type="file"]');
      fileInputs.forEach(input => {
        (input as HTMLInputElement).value = '';
      });
      
      alert('파일이 성공적으로 업로드되었습니다.');
      
      // alert 확인 후 히스토리 리로드
      if (selectedEmployee) {
        console.log('업로드 완료, 히스토리 리로드 시작');
        await loadContracts(selectedEmployee.id);
        setContractsKey(prev => prev + 1);
        console.log('히스토리 리로드 완료');
      }
    } catch (error) {
      console.error('파일 업로드 중 오류:', error);
      
      // 구체적인 에러 메시지 제공
      let errorMessage = '파일 업로드 중 오류가 발생했습니다.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    }
  };

  // 파일 다운로드
  const handleFileDownload = (contract: EmploymentContract) => {
    if (contract.contractFile) {
      const link = document.createElement('a');
      
      // Base64 데이터인지 확인
      if (contract.contractFile.startsWith('data:')) {
        // Base64 데이터인 경우
        link.href = contract.contractFile;
        link.download = contract.contractFileName || 'contract.pdf';
      } else {
        // Firebase Storage URL인 경우
        link.href = contract.contractFile;
        link.download = contract.contractFileName || 'contract.pdf';
        link.target = '_blank';
      }
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // 파일 삭제
  const handleFileDelete = async (contract: EmploymentContract) => {
    console.log('=== 파일 삭제 시작 ===');
    console.log('삭제할 계약서:', contract);
    
    if (!contract.contractFile || contract.contractFile.trim() === '') {
      console.log('파일이 없는 계약서 레코드 삭제');
      
      if (confirm('이 계약서 레코드를 삭제하시겠습니까?')) {
        try {
          // Firestore에서 계약서 레코드 자체를 삭제
          await deleteDoc(doc(db, 'employmentContracts', contract.id));
          console.log('계약서 레코드 삭제 완료');
          
        // 즉시 상태에서 삭제된 계약서 제거
        const updatedContracts = contracts.filter(c => c.id !== contract.id);
        setContracts(updatedContracts);
        setContractsKey(prev => prev + 1); // 강제 리렌더링
        console.log('레코드 삭제 후 즉시 상태 업데이트 완료, 남은 계약서 수:', updatedContracts.length);
          
          alert('계약서 레코드가 성공적으로 삭제되었습니다.');
        } catch (error) {
          console.error('계약서 레코드 삭제 중 오류:', error);
          alert('계약서 레코드 삭제에 실패했습니다.');
        }
      }
      return;
    }
    
    if (confirm('이 근로계약정보를 삭제하시겠습니까?')) {
      try {
        // Base64 데이터가 아닌 경우에만 Firebase Storage에서 삭제
        if (!contract.contractFile.startsWith('data:')) {
          const fileRef = ref(storage, contract.contractFile);
          await deleteObject(fileRef);
          console.log('Firebase Storage에서 파일 삭제 완료');
        } else {
          console.log('Base64 데이터 삭제 (Storage 삭제 불필요)');
        }
        
        // Firestore에서 전체 계약서 레코드 삭제
        await deleteDoc(doc(db, 'employmentContracts', contract.id));
        console.log('계약서 레코드 삭제 완료');
        
        // 즉시 상태에서 삭제된 계약서 제거
        const updatedContracts = contracts.filter(c => c.id !== contract.id);
        setContracts(updatedContracts);
        setContractsKey(prev => prev + 1); // 강제 리렌더링
        console.log('파일 삭제 후 즉시 상태 업데이트 완료, 남은 계약서 수:', updatedContracts.length);
        
        alert('근로계약이 성공적으로 삭제되었습니다.');
      } catch (error) {
        console.error('파일 삭제 중 오류:', error);
        alert('파일 삭제 중 오류가 발생했습니다.');
      }
    }
  };

  // 직원 필터링 및 검색 로직
  const filteredEmployees = employees
    .filter(emp => {
      // 지점 필터링
      if (selectedBranchId) {
        const selectedBranch = branches.find(b => b.id === selectedBranchId);
        if (!selectedBranch || !emp.branchNames?.includes(selectedBranch.name)) {
          return false;
        }
      }

      // 재직/퇴사 필터링
      if (!showResignedEmployees) {
        // 재직중만 보기 (기본값)
        if (emp.status === 'inactive' || emp.resignationDate) {
          return false;
        }
      } else {
        // 퇴사직원만 보기
        if (emp.status !== 'inactive' && !emp.resignationDate) {
          return false;
        }
      }

      // 검색어 필터링
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          emp.name.toLowerCase().includes(searchLower) ||
          emp.phone?.includes(searchTerm) ||
          emp.residentNumber?.includes(searchTerm) ||
          emp.memo?.toLowerCase().includes(searchLower) ||
          emp.branchNames?.some(name => name.toLowerCase().includes(searchLower))
        );
      }

      return true;
    })
    .sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.name.localeCompare(b.name);
      } else {
        return b.name.localeCompare(a.name);
      }
    });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">직원 관리</h1>
        <div className="flex gap-2">
          {bankCodes.length === 0 && (
            <button
              onClick={initializeBankCodes}
              className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 font-medium"
            >
              은행코드 초기화
            </button>
          )}
          <button
            onClick={() => {
              console.log('직원 추가 버튼 클릭됨');
              // 폼 초기화 (지점 매니저인 경우 자동으로 지점 선택됨)
              resetForm();
              setShowForm(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-medium"
          >
            직원 추가
          </button>
        </div>
      </div>

      {/* 지점 선택 */}
      <div className="bg-white p-4 rounded-lg shadow border mb-6">
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">지점 선택:</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedBranchId('')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedBranchId === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              전체 지점
            </button>
            {branches
              .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
              .map((branch) => (
              <button
                key={branch.id}
                onClick={() => setSelectedBranchId(branch.id)}
                disabled={isManager}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedBranchId === branch.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } ${isManager ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {branch.name}
              </button>
            ))}
          </div>
          {isManager && (
            <p className="text-sm text-gray-500">
              매니저 권한으로 {userBranch?.name} 지점만 관리 가능합니다.
            </p>
          )}
        </div>
      </div>


      {/* 직원 목록 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <h2 className="text-lg font-semibold text-gray-900">직원 목록</h2>
            
            {/* 필터링 및 검색 UI */}
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
              {/* 검색 입력 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="직원명, 전화번호, 주민번호, 메모 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              
              {/* 재직/퇴사 필터 */}
              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showResignedEmployees}
                    onChange={(e) => setShowResignedEmployees(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">퇴사직원 보기</span>
                </label>
              </div>
            </div>
          </div>
          
          {/* 검색 결과 및 필터 상태 표시 */}
          {(searchTerm || showResignedEmployees) && (
            <div className="mt-3 text-sm text-gray-600">
              {searchTerm && (
                <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2">
                  검색: &quot;{searchTerm}&quot;
                </span>
              )}
              {showResignedEmployees && (
                <span className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded">
                  퇴사직원 포함
                </span>
              )}
              <span className="ml-2">
                총 {filteredEmployees.length}명
              </span>
            </div>
          )}
        </div>
        
        {/* 데스크톱 테이블 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <button
                    onClick={handleSort}
                    className="flex items-center space-x-1 hover:text-gray-700"
                  >
                    <span>이름 / 주민번호</span>
                    <span className="text-gray-400">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  전화번호
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  지점
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  근무일수 / 입사일
                </th>
                {showResignedEmployees && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    퇴사일
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  근로정보/고용형태
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => (
                <React.Fragment key={employee.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    <div className="space-y-1">
                      <button
                        onClick={() => handleEdit(employee)}
                        className="font-semibold text-blue-600 hover:text-blue-800 text-left"
                      >
                        {employee.name}
                      </button>
                      <div className="text-xs text-gray-400">{employee.residentNumber || '-'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {employee.phone || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="space-y-1">
                      <div className="font-medium">
                        {employee.branchNames && employee.branchNames.length > 0 ? (
                          <div className="space-y-1">
                            {employee.branchNames.map((branchName, index) => (
                              <div key={index}>{branchName}</div>
                            ))}
                          </div>
                        ) : '-'}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="space-y-1">
                      <div className="font-medium">
                        {employee.hireDate ? calculateWorkDays(employee.hireDate, employee.resignationDate) : '-'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {employee.hireDate ? employee.hireDate.toLocaleDateString() : '-'}
                      </div>
                    </div>
                  </td>
                  {showResignedEmployees && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {employee.resignationDate ? employee.resignationDate.toLocaleDateString() : '-'}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      employee.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {employee.status === 'active' ? '재직' : '퇴사'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setShowDocumentModal({ show: true, employee });
                            loadContracts(employee.id);
                            resetContractForm();
                          }}
                          className="text-blue-600 hover:text-blue-900 text-xs"
                        >
                          근로계약관리
                        </button>
                        {hasNoContract(employee.id) && (
                          <span 
                            className="text-red-500 text-sm" 
                            title="근로계약정보가 없습니다. 근로계약을 추가해주세요."
                          >
                            ⚠️
                          </span>
                        )}
                      </div>
                      {!hasNoContract(employee.id) && (() => {
                        const latestContract = contracts
                          .filter(contract => contract.employeeId === employee.id)
                          .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
                        
                        if (latestContract) {
                          return (
                            <div className="text-xs text-gray-600">
                              <div className="font-medium">
                                {latestContract.employmentType}
                              </div>
                              <div className="text-gray-500">
                                {latestContract.salaryType === 'hourly' ? '시급' : '월급'}: {latestContract.salaryAmount?.toLocaleString()}원
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </td>
                </tr>
                {/* 수정 폼 - 해당 직원 행 바로 아래에 표시 */}
                {editingEmployee && editingEmployee.id === employee.id && (
                  <tr>
                    <td colSpan={showResignedEmployees ? 7 : 6} className="px-6 py-4 bg-gray-50">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <h3 className="text-lg font-semibold mb-4 text-gray-900">
                          {editingEmployee.name} 정보 수정
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                이름 *
                              </label>
                              <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="직원 이름"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                전화번호
                              </label>
                              <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="전화번호"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                주민등록번호
                              </label>
                              <input
                                type="text"
                                value={formData.residentNumber}
                                onChange={(e) => setFormData({ ...formData, residentNumber: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="주민등록번호"
                              />
                            </div>
                          </div>
                          
                          {/* 지점 선택 (전체 너비) */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              지점 (복수 선택 가능) *
                            </label>
                            <div className="border border-gray-300 rounded-md p-2">
                              {branches
                                .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
                                .map(branch => (
                                <label key={branch.id} className="flex items-center mb-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedBranches.includes(branch.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedBranches([...selectedBranches, branch.id]);
                                      } else {
                                        setSelectedBranches(selectedBranches.filter(id => id !== branch.id));
                                      }
                                    }}
                                    className="mr-2"
                                    disabled={isManager}
                                  />
                                  <span className="text-sm">{branch.name}</span>
                                </label>
                              ))}
                            </div>
                            {isManager && (
                              <p className="text-sm text-gray-500 mt-1">
                                매니저 권한으로 {userBranch?.name} 지점에 자동 설정됩니다.
                              </p>
                            )}
                          </div>
                          
                          {/* 나머지 필드들 */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                입사일
                              </label>
                              <DateInput
                                value={formData.hireDate}
                                onChange={(value) => setFormData({ ...formData, hireDate: value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                퇴사일
                              </label>
                              <DateInput
                                value={formData.resignationDate || ''}
                                onChange={(value) => setFormData({ ...formData, resignationDate: value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            
                            
                          </div>
                          
                          {/* 수습기간 관리 */}
                          <div className="border-t border-gray-200 pt-4">
                            <h4 className="text-md font-medium text-gray-900 mb-4">수습기간 관리</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  수습 시작일
                                </label>
                                <DateInput
                                  value={formData.probationStartDate}
                                  onChange={(startDate) => {
                                    const endDate = calculateProbationPeriod(startDate, formData.probationPeriod);
                                    const isOnProbation = isCurrentlyOnProbation(startDate, endDate);
                                    setFormData({ 
                                      ...formData, 
                                      probationStartDate: startDate,
                                      probationEndDate: endDate,
                                      isOnProbation: isOnProbation
                                    });
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  수습기간 (개월)
                                </label>
                                <select
                                  value={formData.probationPeriod}
                                  onChange={(e) => {
                                    const period = parseInt(e.target.value);
                                    const endDate = calculateProbationPeriod(formData.probationStartDate, period);
                                    const isOnProbation = isCurrentlyOnProbation(formData.probationStartDate, endDate);
                                    setFormData({ 
                                      ...formData, 
                                      probationPeriod: period,
                                      probationEndDate: endDate,
                                      isOnProbation: isOnProbation
                                    });
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value={1}>1개월</option>
                                  <option value={2}>2개월</option>
                                  <option value={3}>3개월</option>
                                  <option value={6}>6개월</option>
                                  <option value={12}>12개월</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  수습 종료일
                                </label>
                                <DateInput
                                  value={formData.probationEndDate}
                                  onChange={(value) => setFormData({ ...formData, probationEndDate: value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="flex items-center">
                                <input
                                  type="checkbox"
                                  id="isOnProbation"
                                  checked={formData.isOnProbation}
                                  readOnly
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded bg-gray-100"
                                />
                                <label htmlFor="isOnProbation" className="ml-2 block text-sm text-gray-700">
                                  현재 수습 중 (자동 계산)
                                </label>
                              </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              수습 시작일과 기간을 입력하면 자동으로 종료일이 계산됩니다.
                            </p>
                          </div>
                          
                          {/* 급여관리용 은행 정보 */}
                          <div className="border-t border-gray-200 pt-4">
                            <h4 className="text-md font-medium text-gray-900 mb-4">급여 계좌 정보</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  은행명
                                </label>
                                <select
                                  value={formData.bankCode}
                                  onChange={(e) => {
                                    const selectedBank = bankCodes.find(bank => bank.code === e.target.value);
                                    setFormData({ 
                                      ...formData, 
                                      bankCode: e.target.value,
                                      bankName: selectedBank?.name || ''
                                    });
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">은행 선택 ({bankCodes.length}개)</option>
                                  {bankCodes.map(bank => (
                                    <option key={bank.id} value={bank.code}>
                                      {bank.name} ({bank.code})
                                    </option>
                                  ))}
                                </select>
                                {bankCodes.length === 0 && (
                                  <p className="text-sm text-red-500 mt-1">
                                    은행코드가 없습니다. &quot;은행코드 초기화&quot; 버튼을 클릭하세요.
                                  </p>
                                )}
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  계좌번호
                                </label>
                                <input
                                  type="text"
                                  value={formData.accountNumber}
                                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="계좌번호 (숫자만 입력)"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  예금주명
                                </label>
                                <input
                                  type="text"
                                  value={formData.accountHolder}
                                  onChange={(e) => setFormData({ ...formData, accountHolder: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="예금주명"
                                />
                              </div>
                            </div>
                          </div>
                          
                          {/* 메모 */}
                          <div className="border-t border-gray-200 pt-4">
                            <h4 className="text-md font-medium text-gray-900 mb-4">메모</h4>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                직원 메모
                              </label>
                              <textarea
                                value={formData.memo}
                                onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                placeholder="직원에 대한 메모나 특이사항을 입력하세요..."
                                rows={3}
                              />
                            </div>
                          </div>
                          
                          <div className="flex gap-2 pt-4">
                            <button
                              type="submit"
                              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-medium"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('정말 이 직원을 삭제하시겠습니까?')) {
                                  handleDelete(editingEmployee.id);
                                }
                              }}
                              className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 font-medium"
                            >
                              삭제
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('이 직원을 퇴사 처리하시겠습니까?')) {
                                  handleDeactivate(editingEmployee.id);
                                }
                              }}
                              className="bg-yellow-600 text-white px-6 py-2 rounded-md hover:bg-yellow-700 font-medium"
                            >
                              퇴사처리
                            </button>
                            <button
                              type="button"
                              onClick={resetForm}
                              className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-medium"
                            >
                              취소
                            </button>
                          </div>
                        </form>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 뷰 */}
        <div className="md:hidden">
          {filteredEmployees.map((employee) => (
            <div key={employee.id} className="px-4 py-3 border-b border-gray-200 last:border-b-0">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-900">{employee.name}</h3>
                </div>
                <div className="flex items-center space-x-3">
                  {employee.phone && (
                    <a
                      href={`tel:${employee.phone}`}
                      className="text-green-600 hover:text-green-800"
                      title={`${employee.phone}로 전화걸기`}
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </a>
                  )}
                  <button
                    onClick={() => handleEdit(employee)}
                    className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                  >
                    수정
                  </button>
                </div>
              </div>
              
              {/* 수정 폼 - 모바일에서 해당 직원 카드 바로 아래에 표시 */}
              {editingEmployee && editingEmployee.id === employee.id && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900">
                    {editingEmployee.name} 정보 수정
                  </h3>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          이름 *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="직원 이름"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          전화번호
                        </label>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="전화번호"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          지점 (복수 선택 가능) *
                        </label>
                        <div className="border border-gray-300 rounded-md p-2">
                          {branches.map(branch => (
                            <label key={branch.id} className="flex items-center mb-2">
                              <input
                                type="checkbox"
                                checked={selectedBranches.includes(branch.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedBranches([...selectedBranches, branch.id]);
                                  } else {
                                    setSelectedBranches(selectedBranches.filter(id => id !== branch.id));
                                  }
                                }}
                                className="mr-2"
                                disabled={isManager}
                              />
                              <span className="text-sm">{branch.name}</span>
                            </label>
                          ))}
                        </div>
                        {isManager && (
                          <p className="text-sm text-gray-500 mt-1">
                            매니저 권한으로 {userBranch?.name} 지점에 자동 설정됩니다.
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          주민등록번호
                        </label>
                        <input
                          type="text"
                          value={formData.residentNumber}
                          onChange={(e) => setFormData({ ...formData, residentNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="주민등록번호"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          입사일
                        </label>
                        <DateInput
                          value={formData.hireDate}
                          onChange={(value) => setFormData({ ...formData, hireDate: value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          퇴사일
                        </label>
                        <DateInput
                          value={formData.resignationDate}
                          onChange={(value) => setFormData({ ...formData, resignationDate: value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      
                      
                      {/* 메모 필드 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          직원 메모
                        </label>
                        <textarea
                          value={formData.memo}
                          onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          placeholder="직원에 대한 메모나 특이사항을 입력하세요..."
                          rows={3}
                        />
                      </div>
                    </div>
                    
                    {/* 급여관리용 은행 정보 - 모바일 */}
                    <div className="border-t border-gray-200 pt-4">
                      <h4 className="text-md font-medium text-gray-900 mb-4">급여 계좌 정보</h4>
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            은행명
                          </label>
                          <select
                            value={formData.bankCode}
                            onChange={(e) => {
                              const selectedBank = bankCodes.find(bank => bank.code === e.target.value);
                              setFormData({ 
                                ...formData, 
                                bankCode: e.target.value,
                                bankName: selectedBank?.name || ''
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">은행 선택</option>
                            {bankCodes.map(bank => (
                              <option key={bank.id} value={bank.code}>
                                {bank.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            계좌번호
                          </label>
                          <input
                            type="text"
                            value={formData.accountNumber}
                            onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="계좌번호 (숫자만 입력)"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            예금주명
                          </label>
                          <input
                            type="text"
                            value={formData.accountHolder}
                            onChange={(e) => setFormData({ ...formData, accountHolder: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="예금주명"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-4">
                      <button
                        type="submit"
                        className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-medium"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={resetForm}
                        className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-medium"
                      >
                        취소
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
        {filteredEmployees.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? (
              <div>
                <p>검색 결과가 없습니다.</p>
                <p className="text-sm mt-1">다른 검색어를 시도해보세요.</p>
              </div>
            ) : showResignedEmployees ? (
              '퇴사한 직원이 없습니다.'
            ) : selectedBranchId ? (
              '선택된 지점에 등록된 직원이 없습니다.'
            ) : (
              '등록된 직원이 없습니다.'
            )}
          </div>
        )}
      </div>

      {/* 새 직원 추가 폼 */}
      {showForm && !editingEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">새 직원 추가</h2>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      이름 *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="직원 이름"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      전화번호
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="전화번호"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      지점 (복수 선택 가능) *
                    </label>
                    <div className="border border-gray-300 rounded-md p-2">
                      {branches.map(branch => (
                        <label key={branch.id} className="flex items-center mb-2">
                          <input
                            type="checkbox"
                            checked={selectedBranches.includes(branch.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBranches([...selectedBranches, branch.id]);
                              } else {
                                setSelectedBranches(selectedBranches.filter(id => id !== branch.id));
                              }
                            }}
                            className="mr-2"
                            disabled={isManager}
                          />
                          <span className="text-sm">{branch.name}</span>
                        </label>
                      ))}
                    </div>
                    {isManager && (
                      <p className="text-sm text-gray-500 mt-1">
                        매니저 권한으로 {userBranch?.name} 지점에 자동 설정됩니다.
                      </p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        주민등록번호
                      </label>
                      <input
                        type="text"
                        value={formData.residentNumber}
                        onChange={(e) => setFormData({ ...formData, residentNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="주민등록번호"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        입사일
                      </label>
                      <DateInput
                        value={formData.hireDate}
                        onChange={(value) => setFormData({ ...formData, hireDate: value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        퇴사일
                      </label>
                      <DateInput
                        value={formData.resignationDate}
                        onChange={(value) => setFormData({ ...formData, resignationDate: value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                  </div>
                  
                </div>
                
                {/* 수습기간 관리 */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-md font-medium text-gray-900 mb-4">수습기간 관리</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        수습 시작일
                      </label>
                      <DateInput
                        value={formData.probationStartDate}
                        onChange={(startDate) => {
                          const endDate = calculateProbationPeriod(startDate, formData.probationPeriod);
                          const isOnProbation = isCurrentlyOnProbation(startDate, endDate);
                          setFormData({ 
                            ...formData, 
                            probationStartDate: startDate,
                            probationEndDate: endDate,
                            isOnProbation: isOnProbation
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        수습기간 (개월)
                      </label>
                      <select
                        value={formData.probationPeriod}
                        onChange={(e) => {
                          const period = parseInt(e.target.value);
                          const endDate = calculateProbationPeriod(formData.probationStartDate, period);
                          const isOnProbation = isCurrentlyOnProbation(formData.probationStartDate, endDate);
                          setFormData({ 
                            ...formData, 
                            probationPeriod: period,
                            probationEndDate: endDate,
                            isOnProbation: isOnProbation
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={1}>1개월</option>
                        <option value={2}>2개월</option>
                        <option value={3}>3개월</option>
                        <option value={6}>6개월</option>
                        <option value={12}>12개월</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        수습 종료일
                      </label>
                      <DateInput
                        value={formData.probationEndDate}
                        onChange={(value) => setFormData({ ...formData, probationEndDate: value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="isOnProbation"
                        checked={formData.isOnProbation}
                        readOnly
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded bg-gray-100"
                      />
                      <label htmlFor="isOnProbation" className="ml-2 block text-sm text-gray-700">
                        현재 수습 중 (자동 계산)
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    수습 시작일과 기간을 입력하면 자동으로 종료일이 계산됩니다.
                  </p>
                </div>
                
                {/* 급여관리용 은행 정보 */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-md font-medium text-gray-900 mb-4">급여 계좌 정보</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        은행명
                      </label>
                      <select
                        value={formData.bankCode}
                        onChange={(e) => {
                          const selectedBank = bankCodes.find(bank => bank.code === e.target.value);
                          setFormData({ 
                            ...formData, 
                            bankCode: e.target.value,
                            bankName: selectedBank?.name || ''
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">은행 선택 ({bankCodes.length}개)</option>
                        {bankCodes.map(bank => (
                          <option key={bank.id} value={bank.code}>
                            {bank.name} ({bank.code})
                          </option>
                        ))}
                      </select>
                      {bankCodes.length === 0 && (
                        <p className="text-sm text-red-500 mt-1">
                          은행코드가 없습니다. &quot;은행코드 초기화&quot; 버튼을 클릭하세요.
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        계좌번호
                      </label>
                      <input
                        type="text"
                        value={formData.accountNumber}
                        onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="계좌번호 (숫자만 입력)"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        예금주명
                      </label>
                      <input
                        type="text"
                        value={formData.accountHolder}
                        onChange={(e) => setFormData({ ...formData, accountHolder: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예금주명"
                      />
                    </div>
                  </div>
                </div>
                
                {/* 메모 */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-md font-medium text-gray-900 mb-4">메모</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      직원 메모
                    </label>
                    <textarea
                      value={formData.memo}
                      onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="직원에 대한 메모나 특이사항을 입력하세요..."
                      rows={3}
                    />
                  </div>
                </div>
                
                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-medium"
                  >
                    취소
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 근로계약서 모달 */}
      {showContractModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedEmployee.name} - 근로계약서 관리
                </h2>
                <button
                  onClick={() => {
                    setShowContractModal(false);
                    setSelectedEmployee(null);
                    resetContractForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* 근로계약 추가/수정 폼 */}
              {(() => {
                console.log('조건부 렌더링 체크 - showAddContractForm:', showAddContractForm, 'editingContract:', editingContract);
                return (showAddContractForm || editingContract);
              })() && (
              <div className="mb-6">
                <h3 className="text-md font-medium text-gray-900 mb-4">
                  {editingContract ? '근로계약 수정' : '새 근로계약 추가'}
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        기준일 *
                      </label>
                      <DateInput
                        value={contractFormData.startDate}
                        onChange={(value) => setContractFormData({ ...contractFormData, startDate: value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        고용형태 *
                      </label>
                      <select
                        value={contractFormData.employmentType}
                        onChange={(e) => setContractFormData({ ...contractFormData, employmentType: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">고용형태를 선택하세요</option>
                        <option value="근로소득">근로소득</option>
                        <option value="사업소득">사업소득</option>
                        <option value="일용직">일용직</option>
                        <option value="외국인">외국인</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        급여 형태 *
                      </label>
                      <select
                        value={contractFormData.salaryType}
                        onChange={(e) => setContractFormData({ ...contractFormData, salaryType: e.target.value as 'hourly' | 'monthly' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        {/* 근로소득, 사업소득은 시급/월급 선택 가능 */}
                        {(contractFormData.employmentType === '근로소득' || contractFormData.employmentType === '사업소득') && (
                          <>
                            <option value="hourly">시급</option>
                            <option value="monthly">월급</option>
                          </>
                        )}
                        {/* 일용직, 외국인은 시급만 */}
                        {(['일용직', '외국인'].includes(contractFormData.employmentType)) && (
                          <option value="hourly">시급</option>
                        )}
                        {/* 고용형태가 선택되지 않은 경우 둘 다 표시 */}
                        {!contractFormData.employmentType && (
                          <>
                            <option value="hourly">시급</option>
                            <option value="monthly">월급</option>
                          </>
                        )}
                      </select>
                      {contractFormData.employmentType && (
                        <p className="text-xs text-gray-500 mt-1">
                          {contractFormData.employmentType === '근로소득' && '4대보험, 시급/월급 선택'}
                          {contractFormData.employmentType === '사업소득' && '3.3% 세금, 시급/월급 선택'}
                          {contractFormData.employmentType === '일용직' && '세금 없음, 시급만'}
                          {contractFormData.employmentType === '외국인' && '3.3% 세금, 시급만'}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        금액 *
                      </label>
                      <input
                        type="text"
                        value={formatNumber(contractFormData.salaryAmount)}
                        onChange={(e) => {
                          const unformattedValue = unformatNumber(e.target.value);
                          setContractFormData({ ...contractFormData, salaryAmount: unformattedValue });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={contractFormData.salaryType === 'hourly' ? '시급을 입력하세요' : '월급을 입력하세요'}
                        required
                      />
                    </div>
                    
                    {contractFormData.salaryType === 'hourly' && (
                      <div>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={contractFormData.includeHolidayAllowance}
                            onChange={(e) => setContractFormData({ ...contractFormData, includeHolidayAllowance: e.target.checked })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">주휴수당 포함</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          시급에 주휴수당이 포함되어 있는지 선택하세요
                        </p>
                      </div>
                    )}
                    
                    {(contractFormData.employmentType === '근로소득' || contractFormData.employmentType === '사업소득') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          주간근무시간
                        </label>
                        <input
                          type="number"
                          value={contractFormData.weeklyWorkHours}
                          onChange={(e) => setContractFormData({ ...contractFormData, weeklyWorkHours: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="40"
                          min="1"
                          max="60"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          주간 근무시간을 입력하세요 (기본값: 40시간)
                        </p>
                      </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          근로계약서 파일 선택
                        </label>
                      <div className="flex gap-2">
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              // 파일 크기 및 형식 검증
                              const maxSize = 10 * 1024 * 1024; // 10MB
                              if (file.size > maxSize) {
                                alert('파일 크기는 10MB를 초과할 수 없습니다.');
                                e.target.value = ''; // 파일 선택 취소
                                return;
                              }
                              
                              const allowedTypes = [
                                'application/pdf', 
                                'application/msword', 
                                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'image/jpeg', 
                                'image/jpg',
                                'image/png'
                              ];
                              
                              if (!allowedTypes.includes(file.type)) {
                                alert('지원되는 파일 형식: PDF, DOC, DOCX, JPG, PNG');
                                e.target.value = ''; // 파일 선택 취소
                                return;
                              }
                              
                              setSelectedFile(file);
                              setContractFormData({ ...contractFormData, contractFile: file.name });
                            }
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {selectedFile && (
                        <p className="text-xs text-gray-600 mt-1">
                          선택된 파일: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)}MB)
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-4">
                    <button
                      type="button"
                      onClick={resetContractForm}
                      className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-medium"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      onClick={handleContractSubmit}
                      disabled={uploadingFile}
                      className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium disabled:opacity-50"
                    >
                      {editingContract ? '수정' : '추가'}
                    </button>
                  </div>
                </div>
              </div>
              )}

              {/* 근로계약서 목록 */}
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-4">
                  근로계약 히스토리 (총 {contracts.length}개)
                </h3>
                {(() => {
                  console.log('히스토리 테이블 렌더링 체크 - contracts.length:', contracts.length);
                  console.log('현재 contracts 배열:', contracts);
                  return contracts.length === 0;
                })() ? (
                  <div className="text-center py-8 text-gray-500">
                    등록된 근로계약이 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            기준일
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            고용형태
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            급여정보
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            주휴수당/근무시간
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            파일
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            작업
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {contracts.map((contract) => (
                          <tr key={contract.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div className="font-medium">
                                {contract.startDate.toLocaleDateString('ko-KR', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit'
                                })}
                              </div>
                              <div className="text-xs text-gray-500">
                                {contract.startDate.toLocaleDateString('ko-KR', {
                                  weekday: 'short'
                                })}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {contract.employmentType || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {contract.salaryType === 'hourly' ? '시급' : '월급'}
                                </div>
                                <div className="text-xs">
                                  {contract.salaryAmount ? `${contract.salaryAmount.toLocaleString()}원` : '-'}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="space-y-1">
                                {contract.salaryType === 'hourly' && (
                                  <div className="text-xs">
                                    주휴수당: {contract.includeHolidayAllowance ? '포함' : '미포함'}
                                  </div>
                                )}
                                {contract.weeklyWorkHours && (
                                  <div className="text-xs">
                                    주간근무: {contract.weeklyWorkHours}시간
                                  </div>
                                )}
                                {!contract.weeklyWorkHours && contract.salaryType !== 'hourly' && '-'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {contract.contractFile ? (
                                <button
                                  onClick={() => handleFileDownload(contract)}
                                  className="text-blue-600 hover:text-blue-900 text-sm"
                                >
                                  근로계약서 다운로드
                                </button>
                              ) : (
                                <span className="text-gray-400 text-sm">파일 없음</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleContractEdit(contract)}
                                  className="text-blue-600 hover:text-blue-900"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => handleFileDelete(contract)}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  삭제
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 근로계약관리 모달 */}
      {showDocumentModal.show && showDocumentModal.employee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                {showDocumentModal.employee.name} - 근로계약관리
              </h3>
              <button
                onClick={() => setShowDocumentModal({ show: false, employee: null })}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-6">
              {/* 근로계약 섹션 */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  근로계약
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  근로계약 정보와 파일을 관리합니다.
                </p>
                
                {/* 근로계약서 히스토리 (먼저 표시) */}
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-md font-medium text-gray-900">
                      근로계약 히스토리 (총 {contracts.length}개)
                    </h4>
                    <button
                      onClick={() => setShowAddContractForm(true)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
                    >
                      새 근로계약 추가
                    </button>
                  </div>
                  {(() => {
                    console.log('히스토리 테이블 렌더링 체크 - contracts.length:', contracts.length);
                    console.log('현재 contracts 배열:', contracts);
                    return contracts.length === 0;
                  })() ? (
                    <div className="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-md">
                      <p className="mb-4">등록된 근로계약이 없습니다.</p>
                    </div>
                  ) : (
                    <div key={contractsKey} className="overflow-x-auto bg-white border border-gray-200 rounded-md">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              기준일
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              고용형태
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              급여정보
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              주간근무시간
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              근로계약서
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              작업
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {contracts.map((contract) => (
                            <tr key={contract.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {contract.startDate.toLocaleDateString('ko-KR')}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {contract.employmentType || '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div className="space-y-1">
                                  <div className="font-medium">
                                    {contract.salaryType === 'hourly' ? '시급' : '월급'}
                                  </div>
                                  <div className="text-xs">
                                    {contract.salaryAmount ? `${contract.salaryAmount.toLocaleString()}원` : '-'}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {contract.weeklyWorkHours ? `${contract.weeklyWorkHours}시간` : '-'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {contract.contractFile ? (
                                  <button
                                    onClick={() => handleFileDownload(contract)}
                                    className="text-blue-600 hover:text-blue-900 text-xs"
                                    title={contract.contractFileName || '파일 다운로드'}
                                  >
                                    근로계약 다운로드
                                  </button>
                                ) : (
                                  <span className="text-gray-400 text-xs">파일 없음</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                <button
                                  onClick={() => handleContractEdit(contract)}
                                  className="text-blue-600 hover:text-blue-900"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => {
                                    console.log('삭제 버튼 클릭:', contract);
                                    handleFileDelete(contract);
                                  }}
                                  className="text-red-600 hover:text-red-900"
                                >
                                  삭제
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                
                {/* 새 계약서 추가 */}
                {(showAddContractForm || editingContract) && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        기준일 *
                      </label>
                      <DateInput
                        value={contractFormData.startDate}
                        onChange={(value) => setContractFormData({ ...contractFormData, startDate: value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        고용형태 *
                      </label>
                      <select
                        value={contractFormData.employmentType}
                        onChange={(e) => setContractFormData({ ...contractFormData, employmentType: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">고용형태를 선택하세요</option>
                        <option value="근로소득">근로소득</option>
                        <option value="사업소득">사업소득</option>
                        <option value="일용직">일용직</option>
                        <option value="외국인">외국인</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        급여 형태 *
                      </label>
                      <select
                        value={contractFormData.salaryType}
                        onChange={(e) => setContractFormData({ ...contractFormData, salaryType: e.target.value as 'hourly' | 'monthly' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        {/* 근로소득, 사업소득은 시급/월급 선택 가능 */}
                        {(contractFormData.employmentType === '근로소득' || contractFormData.employmentType === '사업소득') && (
                          <>
                            <option value="hourly">시급</option>
                            <option value="monthly">월급</option>
                          </>
                        )}
                        {/* 일용직, 외국인은 시급만 */}
                        {(['일용직', '외국인'].includes(contractFormData.employmentType)) && (
                          <option value="hourly">시급</option>
                        )}
                        {/* 고용형태가 선택되지 않은 경우 둘 다 표시 */}
                        {!contractFormData.employmentType && (
                          <>
                            <option value="hourly">시급</option>
                            <option value="monthly">월급</option>
                          </>
                        )}
                      </select>
                      {contractFormData.employmentType && (
                        <p className="text-xs text-gray-500 mt-1">
                          {contractFormData.employmentType === '근로소득' && '4대보험, 시급/월급 선택'}
                          {contractFormData.employmentType === '사업소득' && '3.3% 세금, 시급/월급 선택'}
                          {contractFormData.employmentType === '일용직' && '세금 없음, 시급만'}
                          {contractFormData.employmentType === '외국인' && '3.3% 세금, 시급만'}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        금액 *
                      </label>
                      <input
                        type="text"
                        value={formatNumber(contractFormData.salaryAmount)}
                        onChange={(e) => {
                          const unformattedValue = unformatNumber(e.target.value);
                          setContractFormData({ ...contractFormData, salaryAmount: unformattedValue });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={contractFormData.salaryType === 'hourly' ? '시급을 입력하세요' : '월급을 입력하세요'}
                        required
                      />
                    </div>
                    
                    {contractFormData.salaryType === 'hourly' && (
                      <div>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={contractFormData.includeHolidayAllowance}
                            onChange={(e) => setContractFormData({ ...contractFormData, includeHolidayAllowance: e.target.checked })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">주휴수당 포함</span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          시급에 주휴수당이 포함되어 있는지 선택하세요
                        </p>
                      </div>
                    )}
                    
                    {(contractFormData.employmentType === '근로소득' || contractFormData.employmentType === '사업소득') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          주간근무시간
                        </label>
                        <input
                          type="number"
                          value={contractFormData.weeklyWorkHours}
                          onChange={(e) => setContractFormData({ ...contractFormData, weeklyWorkHours: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="40"
                          min="1"
                          max="60"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          주간 근무시간을 입력하세요 (기본값: 40시간)
                        </p>
                      </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          근로계약서 파일 선택
                        </label>
                      <div className="flex gap-2">
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              // 파일 크기 및 형식 검증
                              const maxSize = 1 * 1024 * 1024; // 1MB
                              if (file.size > maxSize) {
                                alert('파일 크기가 너무 큽니다. 1MB 이하의 파일로 업로드해주세요.\n\n현재 파일 크기: ' + (file.size / 1024 / 1024).toFixed(1) + 'MB');
                                e.target.value = '';
                                return;
                              }
                              
                              const allowedTypes = [
                                'application/pdf', 
                                'application/msword', 
                                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'image/jpeg', 
                                'image/jpg',
                                'image/png'
                              ];
                              
                              if (!allowedTypes.includes(file.type)) {
                                alert('지원되는 파일 형식: PDF, DOC, DOCX, JPG, PNG');
                                e.target.value = '';
                                return;
                              }
                              
                              setSelectedFile(file);
                              setContractFormData({ ...contractFormData, contractFile: file.name });
                            }
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>
                      {selectedFile && (
                        <p className="text-xs text-gray-600 mt-1">
                          선택된 파일: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)}MB)
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    PDF, DOC, DOCX, JPG, PNG 파일을 업로드할 수 있습니다. (최대 1MB)
                  </p>
                  
                  {/* 저장 버튼 */}
                  <div className="flex gap-2 pt-4">
                    <button
                      type="button"
                      onClick={resetContractForm}
                      className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-medium"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleContractSubmit(e);
                      }}
                      disabled={uploadingFile}
                      className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium disabled:opacity-50"
                    >
                      {uploadingFile ? '저장중...' : (editingContract ? '수정' : '추가')}
                    </button>
                  </div>
                </div>
                )}
              </div>

              {/* 재직증명서 섹션 */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  재직증명서
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  직원의 재직증명서를 PDF로 생성합니다.
                </p>
                <button
                  onClick={() => generateEmploymentCertificate(showDocumentModal.employee!)}
                  className="w-full bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 font-medium"
                >
                  재직증명서 생성
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}