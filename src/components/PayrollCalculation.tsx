'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Employee {
  id: string;
  name: string;
  type?: string;
  status?: string;
  branchNames?: string[];
}

interface Branch {
  id: string;
  name: string;
}

interface PayrollCalculationProps {
  userBranch?: {
    id: string;
    name: string;
  };
  isManager: boolean;
}

const PayrollCalculation: React.FC<PayrollCalculationProps> = ({ userBranch, isManager }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBranches();
    
    // 현재 월을 기본값으로 설정
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(currentMonth);
    
    // 매니저인 경우 해당 지점을 기본 선택
    if (isManager && userBranch) {
      setSelectedBranchId(userBranch.id);
    }
  }, [isManager, userBranch]);

  useEffect(() => {
    if (selectedBranchId && selectedMonth) {
      loadEmployees();
    }
  }, [selectedBranchId, selectedMonth]);

  const loadBranches = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      
      // 한국어 순으로 정렬
      branchesData.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setBranches(branchesData);
    } catch (error) {
      console.error('지점 로드 중 오류:', error);
    }
  };

  const loadEmployees = async () => {
    if (!selectedBranchId || !selectedMonth) return;
    
    try {
      setLoading(true);
      
      // 선택된 월의 첫째 날과 마지막 날 계산
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      
      console.log('급여계산 - 조회 기간:', {
        selectedBranchId,
        selectedMonth,
        monthStart: monthStart.toDateString(),
        monthEnd: monthEnd.toDateString()
      });
      
      // 해당 월에 스케줄이 있는 직원들의 ID 찾기
      const schedulesSnapshot = await getDocs(collection(db, 'schedules'));
      const employeeIdsWithSchedules = new Set<string>();
      
      schedulesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const scheduleDate = data.date?.toDate();
        const scheduleBranchId = data.branchId;
        
        if (scheduleDate && 
            scheduleDate >= monthStart && 
            scheduleDate <= monthEnd &&
            scheduleBranchId === selectedBranchId) {
          employeeIdsWithSchedules.add(data.employeeId);
        }
      });
      
      console.log('스케줄이 있는 직원 IDs:', Array.from(employeeIdsWithSchedules));
      
      // 직원 정보 로드
      const employeesData = [];
      for (const employeeId of employeeIdsWithSchedules) {
        const employeeDoc = await getDocs(query(collection(db, 'employees'), where('__name__', '==', employeeId)));
        if (!employeeDoc.empty) {
          const doc = employeeDoc.docs[0];
          const employeeData = {
            id: doc.id,
            name: doc.data().name || '',
            type: doc.data().type || '',
            status: doc.data().status || 'active',
            branchNames: [] // 지점명은 별도로 로드
          };
          
          // 직원-지점 관계 로드
          const employeeBranchesSnapshot = await getDocs(
            query(collection(db, 'employeeBranches'), where('employeeId', '==', doc.id))
          );
          
          const branchNames: string[] = [];
          for (const ebDoc of employeeBranchesSnapshot.docs) {
            const branchId = ebDoc.data().branchId;
            const branch = branches.find(b => b.id === branchId);
            if (branch) {
              branchNames.push(branch.name);
            }
          }
          
          employeeData.branchNames = branchNames;
          employeesData.push(employeeData);
        }
      }
      
      // 근무시간 비교 상태 확인
      const comparisonSnapshot = await getDocs(collection(db, 'workTimeComparison'));
      const comparisonResults = new Map<string, any>();
      
      comparisonSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const comparisonDate = data.comparisonDate?.toDate();
        
        if (comparisonDate && 
            comparisonDate >= monthStart && 
            comparisonDate <= monthEnd &&
            data.branchId === selectedBranchId) {
          comparisonResults.set(data.employeeId, data);
        }
      });
      
      // 직원 데이터에 비교 상태 추가
      const employeesWithStatus = employeesData.map(emp => ({
        ...emp,
        hasComparison: comparisonResults.has(emp.id),
        comparisonData: comparisonResults.get(emp.id)
      }));
      
      console.log('급여계산 직원 목록:', employeesWithStatus);
      setEmployees(employeesWithStatus);
      
    } catch (error) {
      console.error('직원 로드 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedBranch = branches.find(b => b.id === selectedBranchId);

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">급여계산작업</h3>
        <p className="text-sm text-gray-600 mt-1">급여 계산을 위한 직원 현황을 확인합니다</p>
      </div>
      
      <div className="p-6">
        {/* 조회 조건 */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 지점 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              지점 선택
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
                    onClick={() => setSelectedBranchId(branch.id)}
                    className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                      selectedBranchId === branch.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
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
              비교할 월
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        {/* 직원 목록 */}
        {selectedBranchId && selectedMonth && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-md font-medium text-gray-900">
                {selectedBranch?.name} - {selectedMonth} 직원 현황
              </h4>
              <div className="text-sm text-gray-600">
                총 {employees.length}명
              </div>
            </div>
            
            {loading ? (
              <div className="text-center py-8">
                <div className="text-gray-500">직원 정보를 불러오는 중...</div>
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500">해당 조건에 맞는 직원이 없습니다.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        직원명
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        고용형태
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        근무시간 비교 상태
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        급여계산 상태
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {employees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {employee.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {employee.type || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {employee.hasComparison ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              ✓ 비교 완료
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              🔄 근무시간 작업중
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {employee.hasComparison ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              📊 계산 대기
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              ⏳ 비교 작업 필요
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        
        {!selectedBranchId && (
          <div className="text-center py-8">
            <div className="text-gray-500">지점을 선택해주세요.</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayrollCalculation;
