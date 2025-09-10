import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// 청담장어마켓 송파점 테스트 데이터
const testBranch = {
  name: '청담장어마켓 송파점',
  address: '서울특별시 송파구',
  managerName: '김매니저',
  managerEmail: 'manager@songpa.com',
  ceoName: '이대표',
  businessNumber: '123-45-67890',
  companyName: '청담장어마켓',
  createdAt: new Date(),
  updatedAt: new Date()
};

const testEmployees = [
  {
    name: '김아잉',
    residentNumber: '950101-1234567',
    email: 'kim@example.com',
    phone: '010-1234-5678',
    branchId: '', // 지점 추가 후 설정
    employmentType: '정규직',
    hireDate: new Date('2023-01-01'),
    resignationDate: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: '나인',
    residentNumber: '960202-2345678',
    email: 'nine@example.com',
    phone: '010-2345-6789',
    branchId: '', // 지점 추가 후 설정
    employmentType: '정규직',
    hireDate: new Date('2023-02-01'),
    resignationDate: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: '박영미',
    residentNumber: '970303-3456789',
    email: 'park@example.com',
    phone: '010-3456-7890',
    branchId: '', // 지점 추가 후 설정
    employmentType: '아르바이트',
    hireDate: new Date('2023-03-01'),
    resignationDate: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: '빠잉',
    residentNumber: '980404-4567890',
    email: 'bba@example.com',
    phone: '010-4567-8901',
    branchId: '', // 지점 추가 후 설정
    employmentType: '아르바이트',
    hireDate: new Date('2023-04-01'),
    resignationDate: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: '실장님',
    residentNumber: '900505-5678901',
    email: 'manager@example.com',
    phone: '010-5678-9012',
    branchId: '', // 지점 추가 후 설정
    employmentType: '정규직',
    hireDate: new Date('2022-01-01'),
    resignationDate: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: '양현아',
    residentNumber: '990606-6789012',
    email: 'yang@example.com',
    phone: '010-6789-0123',
    branchId: '', // 지점 추가 후 설정
    employmentType: '아르바이트',
    hireDate: new Date('2023-05-01'),
    resignationDate: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// 2025년 9월 8일 주간 테스트 스케줄 데이터
const testSchedules = [
  // 김아잉
  { employeeName: '김아잉', date: new Date('2025-09-08'), startTime: '05:00', endTime: '22:00', breakTime: '0' },
  { employeeName: '김아잉', date: new Date('2025-09-09'), startTime: '05:00', endTime: '22:00', breakTime: '0' },
  { employeeName: '김아잉', date: new Date('2025-09-11'), startTime: '19:00', endTime: '23:00', breakTime: '0' },
  { employeeName: '김아잉', date: new Date('2025-09-12'), startTime: '19:00', endTime: '23:00', breakTime: '0' },
  
  // 나인
  { employeeName: '나인', date: new Date('2025-09-08'), startTime: '05:00', endTime: '22:00', breakTime: '0' },
  { employeeName: '나인', date: new Date('2025-09-09'), startTime: '05:00', endTime: '22:00', breakTime: '2' },
  { employeeName: '나인', date: new Date('2025-09-11'), startTime: '10:00', endTime: '22:00', breakTime: '2' },
  { employeeName: '나인', date: new Date('2025-09-12'), startTime: '05:00', endTime: '22:00', breakTime: '1' },
  { employeeName: '나인', date: new Date('2025-09-13'), startTime: '05:00', endTime: '16:00', breakTime: '0' },
  { employeeName: '나인', date: new Date('2025-09-14'), startTime: '05:00', endTime: '16:00', breakTime: '0' },
  
  // 박영미
  { employeeName: '박영미', date: new Date('2025-09-09'), startTime: '17:00', endTime: '22:00', breakTime: '0' },
  { employeeName: '박영미', date: new Date('2025-09-11'), startTime: '17:00', endTime: '22:00', breakTime: '0' },
  { employeeName: '박영미', date: new Date('2025-09-12'), startTime: '17:00', endTime: '22:00', breakTime: '0' },
  
  // 빠잉
  { employeeName: '빠잉', date: new Date('2025-09-09'), startTime: '10:00', endTime: '13:00', breakTime: '0' },
  { employeeName: '빠잉', date: new Date('2025-09-11'), startTime: '19:00', endTime: '23:00', breakTime: '0.5' },
  { employeeName: '빠잉', date: new Date('2025-09-12'), startTime: '19:00', endTime: '23:00', breakTime: '0.5' },
  { employeeName: '빠잉', date: new Date('2025-09-13'), startTime: '10:00', endTime: '22:00', breakTime: '2' },
  { employeeName: '빠잉', date: new Date('2025-09-14'), startTime: '10:00', endTime: '22:00', breakTime: '2' },
  
  // 실장님
  { employeeName: '실장님', date: new Date('2025-09-08'), startTime: '10:00', endTime: '22:00', breakTime: '2' },
  { employeeName: '실장님', date: new Date('2025-09-10'), startTime: '10:00', endTime: '22:00', breakTime: '2' },
  { employeeName: '실장님', date: new Date('2025-09-11'), startTime: '10:00', endTime: '22:00', breakTime: '2' },
  { employeeName: '실장님', date: new Date('2025-09-12'), startTime: '10:00', endTime: '22:00', breakTime: '2' },
  { employeeName: '실장님', date: new Date('2025-09-13'), startTime: '10:00', endTime: '22:00', breakTime: '2' },
  { employeeName: '실장님', date: new Date('2025-09-14'), startTime: '10:00', endTime: '22:00', breakTime: '2' },
  
  // 양현아
  { employeeName: '양현아', date: new Date('2025-09-08'), startTime: '10:00', endTime: '15:00', breakTime: '0.5' },
  { employeeName: '양현아', date: new Date('2025-09-09'), startTime: '10:00', endTime: '15:00', breakTime: '0.5' },
  { employeeName: '양현아', date: new Date('2025-09-12'), startTime: '10:00', endTime: '15:00', breakTime: '0.5' },
  { employeeName: '양현아', date: new Date('2025-09-13'), startTime: '10:00', endTime: '15:00', breakTime: '0.5' },
  { employeeName: '양현아', date: new Date('2025-09-14'), startTime: '10:00', endTime: '15:00', breakTime: '0.5' }
];

export async function clearAllData() {
  try {
    console.log('기존 데이터 삭제 중...');
    
    // 스케줄 삭제
    const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
    for (const docSnapshot of schedulesSnapshot.docs) {
      await deleteDoc(doc(db, 'schedules', docSnapshot.id));
    }
    
    // 직원 삭제
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    for (const docSnapshot of employeesSnapshot.docs) {
      await deleteDoc(doc(db, 'employees', docSnapshot.id));
    }
    
    // 지점 삭제
    const branchesSnapshot = await getDocs(collection(db, 'branches'));
    for (const docSnapshot of branchesSnapshot.docs) {
      await deleteDoc(doc(db, 'branches', docSnapshot.id));
    }
    
    console.log('기존 데이터 삭제 완료');
  } catch (error) {
    console.error('데이터 삭제 중 오류:', error);
  }
}

export async function initTestData() {
  try {
    console.log('청담장어마켓 송파점 테스트 데이터 초기화 시작...');
    
    // 기존 데이터 삭제
    await clearAllData();
    
    // 지점 추가
    console.log('지점 추가 중...');
    const branchRef = await addDoc(collection(db, 'branches'), testBranch);
    const branchId = branchRef.id;
    console.log('지점 추가 완료:', branchId);
    
    // 직원 추가 (지점 ID 설정)
    console.log('직원 추가 중...');
    const employeeRefs = [];
    for (const employee of testEmployees) {
      const employeeWithBranch = { ...employee, branchId };
      const employeeRef = await addDoc(collection(db, 'employees'), employeeWithBranch);
      employeeRefs.push({ id: employeeRef.id, name: employee.name });
      console.log('직원 추가 완료:', employee.name);
    }
    
    // 스케줄 추가
    console.log('스케줄 추가 중...');
    for (const schedule of testSchedules) {
      const employee = employeeRefs.find(emp => emp.name === schedule.employeeName);
      if (employee) {
        const totalHours = calculateTotalHours(schedule.startTime, schedule.endTime, schedule.breakTime);
        await addDoc(collection(db, 'schedules'), {
          ...schedule,
          employeeId: employee.id,
          branchId: branchId,
          branchName: testBranch.name,
          totalHours,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log('스케줄 추가 완료:', schedule.employeeName, schedule.date.toDateString());
      }
    }
    
    console.log('청담장어마켓 송파점 테스트 데이터 초기화 완료!');
    console.log('지점 ID:', branchId);
    console.log('직원 수:', employeeRefs.length);
    console.log('스케줄 수:', testSchedules.length);
    
  } catch (error) {
    console.error('테스트 데이터 초기화 중 오류:', error);
  }
}

function calculateTotalHours(startTime: string, endTime: string, breakTime: string): number {
  const startHour = parseInt(startTime.split(':')[0]);
  const endHour = parseInt(endTime.split(':')[0]);
  const breakHours = parseFloat(breakTime) || 0;
  
  return Math.max(0, endHour - startHour - breakHours);
}

// 브라우저에서 실행할 수 있도록 window 객체에 추가
if (typeof window !== 'undefined') {
  (window as unknown as { initTestData: typeof initTestData; clearAllData: typeof clearAllData }).initTestData = initTestData;
  (window as unknown as { initTestData: typeof initTestData; clearAllData: typeof clearAllData }).clearAllData = clearAllData;
}
