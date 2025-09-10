'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
// import html2pdf from 'html2pdf.js'; // 동적 import로 변경

interface Employee {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  branchId?: string;
  branchName?: string;
  residentNumber?: string;
  hireDate?: Date;
  resignationDate?: Date;
  type?: string;
  status?: 'active' | 'inactive';
  contractFile?: string; // 근로계약서 파일 URL
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

interface EmploymentContract {
  id: string;
  employeeId: string;
  contractType: string; // '정규직', '계약직', '아르바이트'
  startDate: Date;
  endDate?: Date; // 계약직의 경우 종료일
  salary?: number;
  workingHours?: string;
  position?: string;
  notes?: string;
  contractFile?: string; // 계약서 파일 URL
  contractFileName?: string; // 원본 파일명
  createdAt: Date;
  updatedAt: Date;
}

interface EmployeeManagementProps {
  userBranch?: {
    id: string;
    name: string;
    managerEmail?: string;
  } | null;
  isManager?: boolean;
}

export default function EmployeeManagement({ userBranch, isManager }: EmployeeManagementProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [contracts, setContracts] = useState<EmploymentContract[]>([]);
  const [showContractModal, setShowContractModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [contractFormData, setContractFormData] = useState({
    contractType: '정규직',
    startDate: '',
    endDate: '',
    salary: '',
    workingHours: '',
    position: '',
    notes: ''
  });
  const [editingContract, setEditingContract] = useState<EmploymentContract | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    branchId: '',
    residentNumber: '',
    hireDate: '',
    type: '정규직'
  });

  useEffect(() => {
    console.log('EmployeeManagement 컴포넌트가 마운트되었습니다.');
    loadEmployees();
    loadBranches();
  }, []);

  useEffect(() => {
    if (isManager && userBranch) {
      setSelectedBranchId(userBranch.id);
    }
  }, [isManager, userBranch]);

  const loadEmployees = async () => {
    console.log('직원 목록을 불러오는 중...');
    try {
      const querySnapshot = await getDocs(collection(db, 'employees'));
      console.log('Firestore에서 받은 직원 데이터:', querySnapshot.docs);
      
      // 지점 목록도 함께 로드
      const branchesSnapshot = await getDocs(collection(db, 'branches'));
      const branchesMap = new Map();
      branchesSnapshot.docs.forEach(doc => {
        branchesMap.set(doc.id, doc.data().name);
      });
      
      const employeesData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const resignationDate = data.resignationDate?.toDate ? data.resignationDate.toDate() : undefined;
        const employee = {
          id: doc.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          branchId: data.branchId || '',
          branchName: data.branchName || branchesMap.get(data.branchId) || '', // 지점명 매핑
          residentNumber: data.residentNumber || '',
          hireDate: data.hireDate?.toDate ? data.hireDate.toDate() : new Date(),
          resignationDate: resignationDate,
          type: data.type || '정규직',
          status: resignationDate ? 'inactive' : 'active', // 퇴사일이 있으면 'inactive', 없으면 'active'
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
        console.log('처리된 직원:', employee);
        return employee;
      }) as Employee[];
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
        name: doc.data().name
      })) as Branch[];
      setBranches(branchesData);
    } catch (error) {
      console.error('지점 목록을 불러올 수 없습니다:', error);
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
  const generateEmploymentCertificate = (employee: Employee) => {
    // 직원의 지점 정보 찾기
    const employeeBranch = branches.find(branch => branch.id === employee.branchId);
    
    // HTML 템플릿 생성
    const htmlContent = `
      <div style="font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
        <h1 style="text-align: center; font-size: 28px; font-weight: bold; margin-bottom: 40px;">재직증명서</h1>
        
        <div style="margin-bottom: 30px;">
          <p style="margin: 5px 0;"><strong>회사명:</strong> ${employeeBranch?.companyName || '[회사명]'}</p>
          <p style="margin: 5px 0;"><strong>대표자:</strong> ${employeeBranch?.ceoName || '[대표자명]'}</p>
          <p style="margin: 5px 0;"><strong>사업자등록번호:</strong> ${employeeBranch?.businessNumber || '[사업자등록번호]'}</p>
        </div>
        
        <div style="margin-bottom: 30px;">
          <p style="margin: 8px 0;"><strong>성명:</strong> ${employee.name}</p>
          <p style="margin: 8px 0;"><strong>주민등록번호:</strong> ${employee.residentNumber || '-'}</p>
          <p style="margin: 8px 0;"><strong>입사일:</strong> ${employee.hireDate ? employee.hireDate.toLocaleDateString() : '-'}</p>
          <p style="margin: 8px 0;"><strong>퇴사일:</strong> ${employee.resignationDate ? employee.resignationDate.toLocaleDateString() : '재직중'}</p>
          <p style="margin: 8px 0;"><strong>지점:</strong> ${employee.branchName || '-'}</p>
          <p style="margin: 8px 0;"><strong>직급:</strong> ${employee.type || '-'}</p>
        </div>
        
        <div style="margin-bottom: 30px;">
          <p style="font-size: 14px; line-height: 1.6;">위의 사람이 위 회사에서 위와 같이 근무하고 있음을 증명합니다.</p>
        </div>
        
        <div style="margin-bottom: 30px;">
          <p style="margin: 5px 0;"><strong>발급일:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <div style="margin-top: 50px;">
          <p style="margin: 5px 0;"><strong>회사명:</strong> ${employeeBranch?.companyName || '[회사명]'}</p>
          <p style="margin: 5px 0;"><strong>대표자:</strong> ${employeeBranch?.ceoName || '[대표자명]'} (인)</p>
        </div>
      </div>
    `;
    
    // 임시 div 생성
    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    document.body.appendChild(element);
    
    // PDF 생성 옵션
    const opt = {
      margin: 1,
      filename: `${employee.name}_재직증명서.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    // PDF 생성 및 다운로드 (동적 import)
    import('html2pdf.js').then((html2pdf) => {
      html2pdf.default().set(opt).from(element).save().then(() => {
        // 임시 div 제거
        document.body.removeChild(element);
      });
    });
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('직원 폼 제출됨:', formData);

    try {
      if (editingEmployee) {
        // 수정
        console.log('직원 수정 시도:', editingEmployee.id);
        
        if (!editingEmployee.id) {
          throw new Error('직원 ID가 없습니다.');
        }
        
        const employeeRef = doc(db, 'employees', editingEmployee.id);
        console.log('문서 참조:', employeeRef);
        
        // 선택된 지점의 이름 찾기
        const selectedBranch = branches.find(branch => branch.id === formData.branchId);
        const branchName = selectedBranch ? selectedBranch.name : '';
        
        const updateData = {
          ...formData,
          branchName: branchName, // 지점명도 함께 업데이트
          hireDate: formData.hireDate ? new Date(formData.hireDate) : new Date(),
          updatedAt: new Date()
        };
        
        console.log('업데이트할 데이터:', updateData);
        
        await updateDoc(employeeRef, updateData);
        console.log('직원 정보가 수정되었습니다.');
      } else {
        // 추가
        console.log('새 직원 추가 시도');
        console.log('formData:', formData);
        
        // 선택된 지점의 이름 찾기
        const selectedBranch = branches.find(branch => branch.id === formData.branchId);
        const branchName = selectedBranch ? selectedBranch.name : '';
        
        const employeeData = {
          name: formData.name,
          email: formData.email || '',
          phone: formData.phone || '',
          branchId: formData.branchId || '',
          branchName: branchName, // 지점명도 함께 저장
          residentNumber: formData.residentNumber || '',
          hireDate: formData.hireDate ? new Date(formData.hireDate) : new Date(),
          type: formData.type || '정규직',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        console.log('저장할 데이터:', employeeData);
        
        const docRef = await addDoc(collection(db, 'employees'), employeeData);
        console.log('새 직원이 추가되었습니다. ID:', docRef.id);
      }

      // 폼 초기화
      setFormData({
        name: '',
        email: '',
        phone: '',
        branchId: '',
        residentNumber: '',
        hireDate: '',
        type: '정규직'
      });
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

  const handleEdit = (employee: Employee) => {
    console.log('직원 수정 시작:', employee);
    console.log('직원 ID:', employee.id);
    
    if (!employee.id) {
      console.error('직원 ID가 없습니다:', employee);
      alert('직원 ID가 없어서 수정할 수 없습니다.');
      return;
    }
    
    setEditingEmployee(employee);
    setFormData({
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      branchId: employee.branchId || '',
      residentNumber: employee.residentNumber || '',
      hireDate: employee.hireDate ? employee.hireDate.toISOString().split('T')[0] : '',
      type: employee.type || '정규직'
    });
    setShowForm(true);
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
      email: '',
      phone: '',
      branchId: '',
      residentNumber: '',
      hireDate: '',
      type: '정규직'
    });
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
      const contractsRef = collection(db, 'employmentContracts');
      const q = query(contractsRef, where('employeeId', '==', employeeId));
      const querySnapshot = await getDocs(q);
      
      const contractsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          employeeId: data.employeeId,
          contractType: data.contractType || '',
          startDate: data.startDate?.toDate ? data.startDate.toDate() : new Date(),
          endDate: data.endDate?.toDate ? data.endDate.toDate() : undefined,
          salary: data.salary || 0,
          workingHours: data.workingHours || '',
          position: data.position || '',
          notes: data.notes || '',
          contractFile: data.contractFile || '',
          contractFileName: data.contractFileName || '',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
        };
      });
      
      setContracts(contractsData.sort((a, b) => b.startDate.getTime() - a.startDate.getTime()));
    } catch (error) {
      console.error('근로계약서 로드 중 오류:', error);
    }
  };

  // 근로계약서 모달 열기
  const handleContractClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShowContractModal(true);
    loadContracts(employee.id);
  };

  // 근로계약서 추가/수정
  const handleContractSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedEmployee) return;
    
    try {
      const contractData = {
        employeeId: selectedEmployee.id,
        contractType: contractFormData.contractType,
        startDate: new Date(contractFormData.startDate),
        endDate: contractFormData.endDate ? new Date(contractFormData.endDate) : null,
        salary: contractFormData.salary ? parseFloat(contractFormData.salary) : 0,
        workingHours: contractFormData.workingHours,
        position: contractFormData.position,
        notes: contractFormData.notes,
        updatedAt: new Date()
      };
      
      if (editingContract) {
        // 수정
        const contractRef = doc(db, 'employmentContracts', editingContract.id);
        await updateDoc(contractRef, contractData);
      } else {
        // 추가
        await addDoc(collection(db, 'employmentContracts'), {
          ...contractData,
          createdAt: new Date()
        });
      }
      
      await loadContracts(selectedEmployee.id);
      resetContractForm();
    } catch (error) {
      console.error('근로계약서 저장 중 오류:', error);
    }
  };

  // 근로계약서 수정
  const handleContractEdit = (contract: EmploymentContract) => {
    setEditingContract(contract);
    setContractFormData({
      contractType: contract.contractType,
      startDate: contract.startDate.toISOString().split('T')[0],
      endDate: contract.endDate ? contract.endDate.toISOString().split('T')[0] : '',
      salary: contract.salary?.toString() || '',
      workingHours: contract.workingHours || '',
      position: contract.position || '',
      notes: contract.notes || ''
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

  // 근로계약서 폼 리셋
  const resetContractForm = () => {
    setContractFormData({
      contractType: '정규직',
      startDate: '',
      endDate: '',
      salary: '',
      workingHours: '',
      position: '',
      notes: ''
    });
    setEditingContract(null);
    setSelectedFile(null);
  };

  // 파일 업로드
  const handleFileUpload = async (file: File, contractId: string) => {
    try {
      setUploadingFile(true);
      
      // 파일명 생성 (직원ID_계약ID_타임스탬프.확장자)
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const fileName = `contracts/${contractId}_${timestamp}.${fileExtension}`;
      
      // Firebase Storage에 업로드
      const storageRef = ref(storage, fileName);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      // Firestore에 파일 정보 업데이트
      const contractRef = doc(db, 'employmentContracts', contractId);
      await updateDoc(contractRef, {
        contractFile: downloadURL,
        contractFileName: file.name,
        updatedAt: new Date()
      });
      
      // 로컬 상태 업데이트
      if (selectedEmployee) {
        await loadContracts(selectedEmployee.id);
      }
      
      setSelectedFile(null);
      alert('파일이 성공적으로 업로드되었습니다.');
    } catch (error) {
      console.error('파일 업로드 중 오류:', error);
      alert('파일 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploadingFile(false);
    }
  };

  // 파일 다운로드
  const handleFileDownload = (contract: EmploymentContract) => {
    if (contract.contractFile) {
      const link = document.createElement('a');
      link.href = contract.contractFile;
      link.download = contract.contractFileName || 'contract.pdf';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // 파일 삭제
  const handleFileDelete = async (contract: EmploymentContract) => {
    if (!contract.contractFile) return;
    
    if (confirm('정말로 이 파일을 삭제하시겠습니까?')) {
      try {
        // Firebase Storage에서 파일 삭제
        const fileRef = ref(storage, contract.contractFile);
        await deleteObject(fileRef);
        
        // Firestore에서 파일 정보 삭제
        const contractRef = doc(db, 'employmentContracts', contract.id);
        await updateDoc(contractRef, {
          contractFile: '',
          contractFileName: '',
          updatedAt: new Date()
        });
        
        // 로컬 상태 업데이트
        if (selectedEmployee) {
          await loadContracts(selectedEmployee.id);
        }
        
        alert('파일이 성공적으로 삭제되었습니다.');
      } catch (error) {
        console.error('파일 삭제 중 오류:', error);
        alert('파일 삭제 중 오류가 발생했습니다.');
      }
    }
  };

  // 선택된 지점의 직원만 필터링하고 정렬
  const filteredEmployees = (selectedBranchId 
    ? employees.filter(emp => emp.branchId === selectedBranchId)
    : employees
  ).sort((a, b) => {
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
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-medium"
        >
          직원 추가
        </button>
      </div>

      {/* 지점 선택 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          지점 선택
        </label>
        <select
          value={selectedBranchId}
          onChange={(e) => setSelectedBranchId(e.target.value)}
          disabled={isManager}
          className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        >
          <option value="">전체 지점</option>
          {branches.map(branch => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        {isManager && (
          <p className="text-sm text-gray-500 mt-1">
            매니저 권한으로 {userBranch?.name} 지점만 관리 가능합니다.
          </p>
        )}
      </div>

      {/* 직원 추가/수정 폼 */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingEmployee ? '직원 정보 수정' : '새 직원 추가'}
          </h2>
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
                  이메일
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="이메일 주소"
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
                  지점
                </label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">지점 선택</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
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
                <input
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  고용 형태
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="정규직">정규직</option>
                  <option value="계약직">계약직</option>
                  <option value="아르바이트">아르바이트</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-medium"
              >
                {editingEmployee ? '수정' : '추가'}
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

      {/* 직원 목록 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">직원 목록</h2>
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
                  이메일 / 전화번호
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  지점 / 고용형태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  근무일수 / 입사일
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  퇴사일
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  문서
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    <div className="space-y-1">
                      <div className="font-semibold">{employee.name}</div>
                      <div className="text-xs text-gray-400">{employee.residentNumber || '-'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="space-y-1">
                      <div>{employee.email || '-'}</div>
                      <div className="text-xs text-gray-400">{employee.phone || '-'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="space-y-1">
                      <div className="font-medium">{employee.branchName || '-'}</div>
                      <div className="text-xs text-gray-400">{employee.type || '-'}</div>
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {employee.resignationDate ? employee.resignationDate.toLocaleDateString() : '-'}
                  </td>
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
                    <div className="flex space-x-2">
                      <button
                        onClick={() => generateEmploymentCertificate(employee)}
                        className="text-blue-600 hover:text-blue-900 text-xs"
                      >
                        재직증명서
                      </button>
                      <button
                        onClick={() => handleContractClick(employee)}
                        className="text-green-600 hover:text-green-900 text-xs"
                      >
                        근로계약서
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(employee)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(employee.id)}
                      className="text-red-600 hover:text-red-900 mr-3"
                    >
                      삭제
                    </button>
                    <button
                      onClick={() => handleDeactivate(employee.id)}
                      className="text-orange-600 hover:text-orange-900"
                    >
                      퇴사
                    </button>
                  </td>
                </tr>
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
                      className="text-green-600 hover:text-green-800 text-lg"
                      title={`${employee.phone}로 전화걸기`}
                    >
                      📞
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
            </div>
          ))}
        </div>
        {filteredEmployees.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {selectedBranchId ? '선택된 지점에 등록된 직원이 없습니다.' : '등록된 직원이 없습니다.'}
          </div>
        )}
      </div>

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
              {/* 근로계약서 추가/수정 폼 */}
              <div className="mb-6">
                <h3 className="text-md font-medium text-gray-900 mb-4">
                  {editingContract ? '근로계약서 수정' : '새 근로계약서 추가'}
                </h3>
                <form onSubmit={handleContractSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        계약 유형
                      </label>
                      <select
                        value={contractFormData.contractType}
                        onChange={(e) => setContractFormData({ ...contractFormData, contractType: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="정규직">정규직</option>
                        <option value="계약직">계약직</option>
                        <option value="아르바이트">아르바이트</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        직급/포지션
                      </label>
                      <input
                        type="text"
                        value={contractFormData.position}
                        onChange={(e) => setContractFormData({ ...contractFormData, position: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예: 매니저, 직원"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        근로 시작일
                      </label>
                      <input
                        type="date"
                        value={contractFormData.startDate}
                        onChange={(e) => setContractFormData({ ...contractFormData, startDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        근로 종료일 (계약직만)
                      </label>
                      <input
                        type="date"
                        value={contractFormData.endDate}
                        onChange={(e) => setContractFormData({ ...contractFormData, endDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        급여 (월급)
                      </label>
                      <input
                        type="number"
                        value={contractFormData.salary}
                        onChange={(e) => setContractFormData({ ...contractFormData, salary: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예: 3000000"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        근무 시간
                      </label>
                      <input
                        type="text"
                        value={contractFormData.workingHours}
                        onChange={(e) => setContractFormData({ ...contractFormData, workingHours: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="예: 09:00-18:00, 주 40시간"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      비고
                    </label>
                    <textarea
                      value={contractFormData.notes}
                      onChange={(e) => setContractFormData({ ...contractFormData, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="추가 사항이나 특이사항을 입력하세요"
                    />
                  </div>
                  
                  <div className="flex gap-2 pt-4">
                    <button
                      type="submit"
                      className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium"
                    >
                      {editingContract ? '수정' : '추가'}
                    </button>
                    <button
                      type="button"
                      onClick={resetContractForm}
                      className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-medium"
                    >
                      취소
                    </button>
                  </div>
                </form>
              </div>

              {/* 근로계약서 목록 */}
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-4">근로계약서 히스토리</h3>
                {contracts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    등록된 근로계약서가 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            계약 유형
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            직급
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            근로 기간
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            급여
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            근무 시간
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            계약서 파일
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
                              {contract.contractType}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {contract.position || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div>
                                <div>{contract.startDate.toLocaleDateString()}</div>
                                {contract.endDate && (
                                  <div className="text-xs text-gray-400">
                                    ~ {contract.endDate.toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {contract.salary ? `${contract.salary.toLocaleString()}원` : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {contract.workingHours || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="space-y-2">
                                {contract.contractFile ? (
                                  <div className="flex items-center space-x-2">
                                    <span className="text-green-600 text-xs">✓ {contract.contractFileName}</span>
                                    <button
                                      onClick={() => handleFileDownload(contract)}
                                      className="text-blue-600 hover:text-blue-900 text-xs"
                                    >
                                      다운로드
                                    </button>
                                    <button
                                      onClick={() => handleFileDelete(contract)}
                                      className="text-red-600 hover:text-red-900 text-xs"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <input
                                      type="file"
                                      accept=".pdf,.doc,.docx"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          setSelectedFile(file);
                                        }
                                      }}
                                      className="text-xs"
                                      id={`file-${contract.id}`}
                                    />
                                    {selectedFile && (
                                      <button
                                        onClick={() => handleFileUpload(selectedFile, contract.id)}
                                        disabled={uploadingFile}
                                        className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                      >
                                        {uploadingFile ? '업로드중...' : '업로드'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={() => handleContractEdit(contract)}
                                className="text-blue-600 hover:text-blue-900 mr-3"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleContractDelete(contract.id)}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}