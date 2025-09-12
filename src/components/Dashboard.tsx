'use client';

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import EmployeeManagement from './EmployeeManagement';
import ScheduleManagement from './ScheduleManagement';
import BranchManagement from './BranchManagement';
import ReportManagement from './ReportManagement';
import WorkTimeComparison from './WorkTimeComparison';

interface DashboardProps {
  user: User;
}

interface Branch {
  id: string;
  name: string;
  managerEmail?: string;
}

export default function Dashboard({ user }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('home');
  const [userBranch, setUserBranch] = useState<Branch | null>(null);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    checkManagerRole();
  }, [user]);

  const checkManagerRole = async () => {
    try {
      console.log('매니저 권한 확인 중:', user.email);
      
      // 매니저 이메일로 지점을 찾기
      const branchesQuery = query(
        collection(db, 'branches'),
        where('managerEmail', '==', user.email)
      );
      
      const querySnapshot = await getDocs(branchesQuery);
      
      if (!querySnapshot.empty) {
        const branchDoc = querySnapshot.docs[0];
        const branchData = branchDoc.data();
        
        setUserBranch({
          id: branchDoc.id,
          name: branchData.name,
          managerEmail: branchData.managerEmail
        });
        setIsManager(true);
        
        console.log('매니저로 확인됨:', branchData.name);
      } else {
        setIsManager(false);
        console.log('일반 사용자로 확인됨');
      }
    } catch (error) {
      console.error('매니저 권한 확인 중 오류:', error);
      setIsManager(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

  const handleTabChange = (tab: string) => {
    console.log('탭 변경됨:', tab);
    setActiveTab(tab);
  };

  console.log('Dashboard 렌더링됨, 현재 탭:', activeTab);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 sm:py-6 space-y-3 sm:space-y-0">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">근무 스케줄 관리</h1>
              <p className="text-sm text-gray-800 font-medium mt-1">
                {user.email} {isManager ? `(${userBranch?.name} 매니저)` : '(관리자)'}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium w-full sm:w-auto"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2 sm:gap-0 sm:space-x-8 py-2 sm:py-0">
            <button
              onClick={() => handleTabChange('home')}
              className={`py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'home'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              홈
            </button>
            {!isManager && (
              <button
                onClick={() => handleTabChange('branches')}
                className={`py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'branches'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                지점 관리
              </button>
            )}
            <button
              onClick={() => handleTabChange('employees')}
              className={`py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'employees'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              직원 관리
            </button>
            <button
              onClick={() => handleTabChange('schedule')}
              className={`py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'schedule'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              스케줄 관리
            </button>
            <button
              onClick={() => handleTabChange('reports')}
              className={`py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'reports'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              보고서
            </button>
            <button
              onClick={() => handleTabChange('work-comparison')}
              className={`py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'work-comparison'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              근무시간 비교
            </button>
            <a
              href="/development-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 sm:py-4 px-2 sm:px-1 border-b-2 border-transparent font-medium text-sm text-gray-700 hover:text-gray-900 hover:border-gray-300 whitespace-nowrap"
            >
              개발가이드
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-4 sm:py-6">
          {activeTab === 'home' && (
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-4 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  환영합니다!
                </h3>
                <p className="mt-2 text-sm text-gray-700 font-medium">
                  근무 스케줄 관리 시스템에 오신 것을 환영합니다.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <button 
                    onClick={() => setActiveTab('branches')}
                    className="bg-blue-50 p-4 rounded-lg hover:bg-blue-100 transition-colors duration-200 cursor-pointer text-left w-full"
                  >
                    <h4 className="font-medium text-blue-900">지점 관리</h4>
                    <p className="text-blue-600 text-sm">지점 정보를 관리합니다</p>
                  </button>
                  <button 
                    onClick={() => setActiveTab('employees')}
                    className="bg-green-50 p-4 rounded-lg hover:bg-green-100 transition-colors duration-200 cursor-pointer text-left w-full"
                  >
                    <h4 className="font-medium text-green-900">직원 관리</h4>
                    <p className="text-green-600 text-sm">직원 정보를 관리합니다</p>
                  </button>
                  <button 
                    onClick={() => setActiveTab('schedule')}
                    className="bg-purple-50 p-4 rounded-lg hover:bg-purple-100 transition-colors duration-200 cursor-pointer text-left w-full"
                  >
                    <h4 className="font-medium text-purple-900">스케줄 관리</h4>
                    <p className="text-purple-600 text-sm">근무 스케줄을 관리합니다</p>
                  </button>
                  <button 
                    onClick={() => setActiveTab('reports')}
                    className="bg-orange-50 p-4 rounded-lg hover:bg-orange-100 transition-colors duration-200 cursor-pointer text-left w-full"
                  >
                    <h4 className="font-medium text-orange-900">보고서</h4>
                    <p className="text-orange-600 text-sm">근무 현황을 확인합니다</p>
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'branches' && (
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-4 sm:p-6">
                <BranchManagement />
              </div>
            </div>
          )}
          
          {activeTab === 'employees' && (
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-4 sm:p-6">
                <EmployeeManagement userBranch={userBranch} isManager={isManager} />
              </div>
            </div>
          )}
          
          {activeTab === 'schedule' && (
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-4 sm:p-6">
                <ScheduleManagement userBranch={userBranch} isManager={isManager} />
              </div>
            </div>
          )}
          
          {activeTab === 'reports' && (
            <ReportManagement />
          )}
          
          {activeTab === 'work-comparison' && (
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-4 sm:p-6">
                <WorkTimeComparison userBranch={userBranch} isManager={isManager} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}