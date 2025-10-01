// 🔥 2-B: 집계 데이터 캐싱 유틸리티
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, orderBy, limit } from 'firebase/firestore';

export interface EmployeeMonthlyStats {
  id?: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  month: string; // "2025-09"
  totalWorkHours: number;
  totalBreakTime: number;
  actualWorkHours: number;
  overtimeHours: number;
  weeklyHolidayHours: number;
  weeklyHolidayPay: number;
  grossPay: number;
  netPay: number;
  lastUpdated: Date;
  isConfirmed: boolean; // 급여확정 여부
}

// 🔥 월별 집계 데이터 생성/업데이트
export const updateEmployeeMonthlyStats = async (
  employeeId: string,
  employeeName: string,
  branchId: string,
  branchName: string,
  month: string,
  stats: {
    totalWorkHours: number;
    totalBreakTime: number;
    actualWorkHours: number;
    overtimeHours: number;
    weeklyHolidayHours: number;
    weeklyHolidayPay: number;
    grossPay: number;
    netPay: number;
    isConfirmed?: boolean;
  }
): Promise<void> => {
  try {
    // 기존 집계 데이터 확인
    const existingQuery = query(
      collection(db, 'employeeMonthlyStats'),
      where('employeeId', '==', employeeId),
      where('branchId', '==', branchId),
      where('month', '==', month),
      orderBy('lastUpdated', 'desc'),
      limit(1)
    );
    
    const existingSnapshot = await getDocs(existingQuery);
    
    const statsData = {
      employeeId,
      employeeName,
      branchId,
      branchName,
      month,
      ...stats,
      lastUpdated: new Date(),
      isConfirmed: stats.isConfirmed || false
    };
    
    if (existingSnapshot.empty) {
      // 새로 생성
      await addDoc(collection(db, 'employeeMonthlyStats'), statsData);
      console.log('🔥 새로운 월별 집계 데이터 생성:', statsData);
    } else {
      // 기존 데이터 업데이트
      const docId = existingSnapshot.docs[0].id;
      await updateDoc(doc(db, 'employeeMonthlyStats', docId), statsData);
      console.log('🔥 기존 월별 집계 데이터 업데이트:', statsData);
    }
  } catch (error) {
    console.error('🔥 월별 집계 데이터 저장 실패:', error);
  }
};

// 🔥 월별 집계 데이터 조회
export const getEmployeeMonthlyStats = async (
  employeeId: string,
  branchId: string,
  month: string
): Promise<EmployeeMonthlyStats | null> => {
  try {
    const statsQuery = query(
      collection(db, 'employeeMonthlyStats'),
      where('employeeId', '==', employeeId),
      where('branchId', '==', branchId),
      where('month', '==', month),
      orderBy('lastUpdated', 'desc'),
      limit(1)
    );
    
    const snapshot = await getDocs(statsQuery);
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    } as EmployeeMonthlyStats;
  } catch (error) {
    console.error('🔥 월별 집계 데이터 조회 실패:', error);
    return null;
  }
};

// 🔥 특정 월의 모든 직원 집계 데이터 조회
export const getAllEmployeeMonthlyStats = async (
  month: string,
  branchId?: string
): Promise<EmployeeMonthlyStats[]> => {
  try {
    let statsQuery = query(
      collection(db, 'employeeMonthlyStats'),
      where('month', '==', month),
      orderBy('employeeName')
    );
    
    if (branchId) {
      statsQuery = query(
        collection(db, 'employeeMonthlyStats'),
        where('month', '==', month),
        where('branchId', '==', branchId),
        orderBy('employeeName')
      );
    }
    
    const snapshot = await getDocs(statsQuery);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as EmployeeMonthlyStats[];
  } catch (error) {
    console.error('🔥 전체 월별 집계 데이터 조회 실패:', error);
    return [];
  }
};
