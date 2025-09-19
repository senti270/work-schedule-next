'use client';

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import EmployeeManagement from './EmployeeManagement';
import ScheduleManagement from './ScheduleManagement';
import BranchManagement from './BranchManagement';
import ReportManagement from './ReportManagement';
import WorkTimeComparison from './WorkTimeComparison';
import ManagerAccountManagement from './ManagerAccountManagement';

interface DashboardProps {
  user: User;
}

interface Branch {
  id: string;
  name: string;
  managerId?: string; // managerEmail 대신 managerId 사용
}

interface Comment {
  id: string;
  content: string;
  authorId: string;
  authorName: string; // 지점명 또는 "관리자"
  adminConfirmRequest?: boolean; // 관리자 확인 요청
  isImportant?: boolean; // 중요
  isPinned?: boolean; // 상단고정
  isCompleted?: boolean; // 완료 처리
  createdAt: Date;
  updatedAt: Date;
}

export default function Dashboard({ user }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('home');
  const [activeSubTab, setActiveSubTab] = useState('');
  const [userBranch, setUserBranch] = useState<{
    id: string;
    name: string;
    managerId?: string;
  } | null>(null);
  const [isManager, setIsManager] = useState(false);
  
  // 코멘트 관련 상태
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [commentOptions, setCommentOptions] = useState({
    adminConfirmRequest: false,
    isImportant: false,
    isPinned: false
  });
  const [editingComment, setEditingComment] = useState<{ 
    id: string; 
    content: string; 
    options: {
      adminConfirmRequest: boolean;
      isImportant: boolean;
      isPinned: boolean;
    }
  } | null>(null);
  const [showAllComments, setShowAllComments] = useState(false);

  useEffect(() => {
    checkManagerRole();
    loadComments();
  }, [user]);

  const checkManagerRole = async () => {
    try {
      // 사용자 ID 추출
      let userId = '';
      if (user.email === 'drawing555@naver.com') {
        userId = 'drawing555';
      } else if (user.email?.includes('@manager.workschedule.local')) {
        userId = user.email.split('@')[0];
      } else {
        // 매니저 계정 DB에서 해당 사용자 찾기
        const managerAccountsSnapshot = await getDocs(collection(db, 'managerAccounts'));
        const managerAccount = managerAccountsSnapshot.docs.find(doc => {
          const data = doc.data();
          // 이메일에 userId가 포함되어 있는지 확인
          return user.email?.includes(data.userId);
        });
        
        if (managerAccount) {
          userId = managerAccount.data().userId;
          
          // 매니저 계정의 branchId로 지점 정보 설정
          if (managerAccount.data().branchId !== 'master') {
            const branchesSnapshot = await getDocs(collection(db, 'branches'));
            const branch = branchesSnapshot.docs.find(doc => doc.id === managerAccount.data().branchId);
            if (branch) {
              setUserBranch({
                id: branch.id,
                name: branch.data().name,
                managerId: userId
              });
              setIsManager(true);
            }
          }
        } else {
          userId = user.email || '';
        }
      }
      
      console.log('매니저 권한 확인 중:', userId);
      setCurrentUserId(userId);
      
      // 매니저 계정 DB에서 지점 정보 가져오기
      const managerAccountsSnapshot = await getDocs(collection(db, 'managerAccounts'));
      const managerAccount = managerAccountsSnapshot.docs.find(doc => {
        const data = doc.data();
        return data.userId === userId && data.isActive;
      });
      
      if (managerAccount) {
        const accountData = managerAccount.data();
        
        if (accountData.branchId === 'master') {
          // 마스터 계정
          setIsManager(false); // 마스터는 관리자
          setUserBranch(null);
          console.log('마스터 계정으로 확인됨');
        } else {
          // 지점 매니저
          setUserBranch({
            id: accountData.branchId,
            name: accountData.branchName,
            managerId: userId
          });
          setIsManager(true);
          console.log('지점 매니저로 확인됨:', accountData.branchName);
        }
      } else {
        // 기존 방식으로 branches 컬렉션에서 찾기 (drawing555 등)
        const branchesQuery = query(
          collection(db, 'branches'),
          where('managerId', '==', userId)
        );
        
        const querySnapshot = await getDocs(branchesQuery);
        
        if (!querySnapshot.empty) {
          const branchDoc = querySnapshot.docs[0];
          const branchData = branchDoc.data();
          
          setUserBranch({
            id: branchDoc.id,
            name: branchData.name,
            managerId: branchData.managerId
          });
          setIsManager(true);
          
          console.log('기존 방식으로 매니저 확인됨:', branchData.name);
        } else {
          setIsManager(false);
          console.log('일반 사용자로 확인됨');
        }
      }
    } catch (error) {
      console.error('매니저 권한 확인 중 오류:', error);
      setIsManager(false);
    }
  };

  const loadComments = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'comments'));
      const commentsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        content: doc.data().content,
        authorId: doc.data().authorId || '',
        authorName: doc.data().authorName || '알 수 없음',
        adminConfirmRequest: doc.data().adminConfirmRequest || false,
        isImportant: doc.data().isImportant || false,
        isPinned: doc.data().isPinned || false,
        isCompleted: doc.data().isCompleted || false,
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date()
      })) as Comment[];
      
      // 상단고정 코멘트를 먼저, 나머지는 최신순으로 정렬
      commentsData.sort((a, b) => {
        // 상단고정 우선
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        
        // 둘 다 상단고정이거나 둘 다 일반이면 최신순
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      
      setComments(commentsData);
    } catch (error) {
      console.error('코멘트 로드 중 오류:', error);
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) {
      alert('코멘트 내용을 입력해주세요.');
      return;
    }

    try {
      // 작성자 정보 설정
      let userId = '';
      let authorName = '';
      
      console.log('코멘트 작성 디버깅:', {
        email: user.email,
        isManager,
        userBranch: userBranch?.name
      });
      
      if (user.email === 'drawing555@naver.com') {
        userId = 'drawing555';
        authorName = 'drawing555(마스터)';
        console.log('drawing555 마스터 계정으로 처리');
      } else if (user.email?.includes('@manager.workschedule.local')) {
        // 매니저 계정에서 userId 추출
        userId = user.email.split('@')[0];
        const branchName = isManager && userBranch ? userBranch.name : '관리자';
        authorName = `${userId}(${branchName})`;
        console.log('매니저 계정으로 처리:', { userId, branchName, isManager, userBranch: userBranch?.name });
      } else {
        // 매니저 계정 DB에서 해당 사용자 찾기
        const managerAccountsSnapshot = await getDocs(collection(db, 'managerAccounts'));
        const managerAccount = managerAccountsSnapshot.docs.find(doc => {
          const data = doc.data();
          return user.email?.includes(data.userId);
        });
        
        console.log('매니저 계정 DB 검색 결과:', managerAccount?.data());
        
        if (managerAccount) {
          userId = managerAccount.data().userId;
          // 마스터 계정인지 확인 (branchId가 'master'인 경우)
          if (managerAccount.data().branchId === 'master') {
            authorName = `${userId}(마스터)`;
            console.log('DB에서 마스터 계정으로 확인');
          } else {
            const branchName = isManager && userBranch ? userBranch.name : managerAccount.data().branchName;
            authorName = `${userId}(${branchName})`;
            console.log('DB에서 지점 매니저로 확인:', { userId, branchName, isManager, userBranch: userBranch?.name });
          }
        } else {
          userId = user.email || '';
          const branchName = isManager && userBranch ? userBranch.name : '관리자';
          authorName = `${userId}(${branchName})`;
          console.log('매니저 계정 DB에서 찾지 못함:', { userId, branchName });
        }
      }
      
      console.log('최종 작성자 정보:', { userId, authorName });
      
      await addDoc(collection(db, 'comments'), {
        content: newComment.trim(),
        authorId: userId,
        authorName: authorName,
        adminConfirmRequest: commentOptions.adminConfirmRequest,
        isImportant: commentOptions.isImportant,
        isPinned: commentOptions.isPinned,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      setNewComment('');
      setCommentOptions({
        adminConfirmRequest: false,
        isImportant: false,
        isPinned: false
      });
      await loadComments();
    } catch (error) {
      console.error('코멘트 추가 중 오류:', error);
      alert('코멘트 추가 중 오류가 발생했습니다.');
    }
  };

  const editComment = async () => {
    if (!editingComment || !editingComment.content.trim()) {
      alert('코멘트 내용을 입력해주세요.');
      return;
    }

    try {
      await updateDoc(doc(db, 'comments', editingComment.id), {
        content: editingComment.content.trim(),
        adminConfirmRequest: editingComment.options.adminConfirmRequest,
        isImportant: editingComment.options.isImportant,
        isPinned: editingComment.options.isPinned,
        updatedAt: new Date()
      });
      
      setEditingComment(null);
      await loadComments();
    } catch (error) {
      console.error('코멘트 수정 중 오류:', error);
      alert('코멘트 수정 중 오류가 발생했습니다.');
    }
  };

  const toggleCompleteComment = async (commentId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'comments', commentId), {
        isCompleted: !currentStatus,
        updatedAt: new Date()
      });
      await loadComments();
    } catch (error) {
      console.error('코멘트 완료 처리 중 오류:', error);
      alert('코멘트 완료 처리 중 오류가 발생했습니다.');
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm('이 코멘트를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'comments', commentId));
      await loadComments();
    } catch (error) {
      console.error('코멘트 삭제 중 오류:', error);
      alert('코멘트 삭제 중 오류가 발생했습니다.');
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
    
    // 보고서 탭인 경우 근무보고서를 기본으로 설정
    if (tab === 'reports') {
      setActiveSubTab('work-report');
    } else if (tab === 'payroll') {
      // 급여작업 탭인 경우 근무시간 비교를 기본으로 설정
      setActiveSubTab('work-comparison');
    } else {
      setActiveSubTab(''); // 다른 탭 변경 시 서브탭 초기화
    }
  };

  const handleSubTabChange = (subTab: string) => {
    console.log('서브탭 변경됨:', subTab);
    setActiveSubTab(subTab);
  };

  console.log('Dashboard 렌더링됨, 현재 탭:', activeTab);
  console.log('현재 사용자 정보:', { 
    email: user.email, 
    isManager, 
    userBranch: userBranch?.name 
  });

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
            {!isManager && (
              <button
                onClick={() => handleTabChange('payroll')}
                className={`py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === 'payroll'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                급여작업
              </button>
            )}
            {!isManager && (
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
            )}
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
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 text-center">
                    💻 본 시스템은 PC화면에서 최적화되어있습니다
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {!isManager && (
                    <button 
                      onClick={() => setActiveTab('branches')}
                      className="bg-blue-50 p-4 rounded-lg hover:bg-blue-100 transition-colors duration-200 cursor-pointer text-left w-full"
                    >
                      <h4 className="font-medium text-blue-900">지점 관리</h4>
                      <p className="text-blue-600 text-sm">지점 정보를 관리합니다</p>
                    </button>
                  )}
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
                  {!isManager && (
                    <button 
                      onClick={() => setActiveTab('payroll')}
                      className="bg-yellow-50 p-4 rounded-lg hover:bg-yellow-100 transition-colors duration-200 cursor-pointer text-left w-full"
                    >
                      <h4 className="font-medium text-yellow-900">급여작업</h4>
                      <p className="text-yellow-600 text-sm">급여 관련 작업을 수행합니다</p>
                    </button>
                  )}
                  {!isManager && (
                    <button 
                      onClick={() => setActiveTab('reports')}
                      className="bg-orange-50 p-4 rounded-lg hover:bg-orange-100 transition-colors duration-200 cursor-pointer text-left w-full"
                    >
                      <h4 className="font-medium text-orange-900">보고서</h4>
                      <p className="text-orange-600 text-sm">근무 현황을 확인합니다</p>
                    </button>
                  )}
                </div>
                
                {/* 코멘트 섹션 */}
                <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">코멘트</h3>
                    <p className="text-sm text-gray-600 mt-1">중요한 공지사항이나 메모를 남겨보세요</p>
                  </div>
                  
                  {/* 코멘트 입력 */}
                  <div className="p-6 border-b border-gray-200">
                    <div className="space-y-4">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="코멘트를 입력하세요..."
                        className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      
                      {/* 코멘트 옵션 체크박스 */}
                      <div className="flex flex-wrap gap-4 text-sm">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={commentOptions.adminConfirmRequest}
                            onChange={(e) => setCommentOptions(prev => ({ ...prev, adminConfirmRequest: e.target.checked }))}
                            className="mr-2"
                          />
                          <span className="text-gray-700">📋 관리자 확인 요청</span>
                        </label>
                        
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={commentOptions.isImportant}
                            onChange={(e) => setCommentOptions(prev => ({ ...prev, isImportant: e.target.checked }))}
                            className="mr-2"
                          />
                          <span className="text-gray-700">⚠️ 중요</span>
                        </label>
                        
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={commentOptions.isPinned}
                            onChange={(e) => setCommentOptions(prev => ({ ...prev, isPinned: e.target.checked }))}
                            className="mr-2"
                          />
                          <span className="text-gray-700">📌 상단고정</span>
                        </label>
                      </div>
                      
                      <div className="flex justify-end">
                        <button
                          onClick={addComment}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          코멘트 추가
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* 코멘트 목록 */}
                  <div className="divide-y divide-gray-200">
                    {comments.length > 0 ? (
                      (showAllComments ? comments : comments.slice(0, 10)).map((comment) => (
                        <div key={comment.id} className={`p-6 ${comment.isPinned ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''} ${comment.isCompleted ? 'opacity-60' : ''}`}>
                          {editingComment?.id === comment.id ? (
                            /* 수정 모드 */
                            <div className="space-y-4">
                              <textarea
                                value={editingComment.content}
                                onChange={(e) => setEditingComment(prev => prev ? { ...prev, content: e.target.value } : null)}
                                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                              />
                              
                              {/* 수정 시 옵션 체크박스 */}
                              <div className="flex flex-wrap gap-4 text-sm">
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={editingComment.options.adminConfirmRequest}
                                    onChange={(e) => setEditingComment(prev => prev ? { 
                                      ...prev, 
                                      options: { ...prev.options, adminConfirmRequest: e.target.checked }
                                    } : null)}
                                    className="mr-2"
                                  />
                                  <span className="text-gray-700">📋 관리자 확인 요청</span>
                                </label>
                                
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={editingComment.options.isImportant}
                                    onChange={(e) => setEditingComment(prev => prev ? { 
                                      ...prev, 
                                      options: { ...prev.options, isImportant: e.target.checked }
                                    } : null)}
                                    className="mr-2"
                                  />
                                  <span className="text-gray-700">⚠️ 중요</span>
                                </label>
                                
                                <label className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={editingComment.options.isPinned}
                                    onChange={(e) => setEditingComment(prev => prev ? { 
                                      ...prev, 
                                      options: { ...prev.options, isPinned: e.target.checked }
                                    } : null)}
                                    className="mr-2"
                                  />
                                  <span className="text-gray-700">📌 상단고정</span>
                                </label>
                              </div>
                              
                              <div className="flex space-x-2">
                                <button
                                  onClick={editComment}
                                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingComment(null)}
                                  className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* 일반 표시 모드 */
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className="text-xs font-medium text-blue-600">
                                    {comment.authorName}
                                  </span>
                                  <span className="text-xs text-gray-400">•</span>
                                  <span className="text-xs text-gray-500">
                                    {comment.createdAt.toLocaleString('ko-KR')}
                                  </span>
                                  
                                  {/* 옵션 표시 */}
                                  {comment.adminConfirmRequest && (
                                    <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                                      📋 확인요청
                                    </span>
                                  )}
                                  {comment.isImportant && (
                                    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                                      ⚠️ 중요
                                    </span>
                                  )}
                                  {comment.isPinned && (
                                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                                      📌 고정
                                    </span>
                                  )}
                                  {comment.isCompleted && (
                                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                      ✅ 완료
                                    </span>
                                  )}
                                </div>
                                <p className={`text-sm whitespace-pre-wrap ${comment.isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                  {comment.content}
                                </p>
                              </div>
                              
                              <div className="flex space-x-2 ml-4">
                                <button
                                  onClick={() => toggleCompleteComment(comment.id, comment.isCompleted || false)}
                                  className={`text-sm ${comment.isCompleted ? 'text-gray-600 hover:text-gray-800' : 'text-green-600 hover:text-green-800'}`}
                                >
                                  {comment.isCompleted ? '완료취소' : '완료'}
                                </button>
                                
                                {(comment.authorId === currentUserId || user.email === 'drawing555@naver.com') && (
                                  <>
                                    <button
                                      onClick={() => setEditingComment({
                                        id: comment.id,
                                        content: comment.content,
                                        options: {
                                          adminConfirmRequest: comment.adminConfirmRequest || false,
                                          isImportant: comment.isImportant || false,
                                          isPinned: comment.isPinned || false
                                        }
                                      })}
                                      className="text-blue-600 hover:text-blue-800 text-sm"
                                    >
                                      수정
                                    </button>
                                    <button
                                      onClick={() => deleteComment(comment.id)}
                                      className="text-red-600 hover:text-red-800 text-sm"
                                    >
                                      삭제
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-gray-500">
                        아직 코멘트가 없습니다.
                      </div>
                    )}
                    
                    {/* 더보기 버튼 */}
                    {comments.length > 10 && !showAllComments && (
                      <div className="p-4 text-center border-t border-gray-200">
                        <button
                          onClick={() => setShowAllComments(true)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          더보기 ({comments.length - 10}개 더)
                        </button>
                      </div>
                    )}
                    
                    {/* 접기 버튼 */}
                    {showAllComments && comments.length > 10 && (
                      <div className="p-4 text-center border-t border-gray-200">
                        <button
                          onClick={() => setShowAllComments(false)}
                          className="text-gray-600 hover:text-gray-800 text-sm font-medium"
                        >
                          접기
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'branches' && (
            <div className="space-y-6">
              {/* 지점 관리 서브탭 네비게이션 */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex space-x-8">
                    <button
                      onClick={() => setActiveSubTab('')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeSubTab === ''
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      지점 정보 관리
                    </button>
                    <button
                      onClick={() => setActiveSubTab('manager-accounts')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeSubTab === 'manager-accounts'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      매니저 계정 관리
                    </button>
                  </div>
                </div>
              </div>

              {/* 서브탭 컨텐츠 */}
              {activeSubTab === '' && (
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-4 sm:p-6">
                    <BranchManagement />
                  </div>
                </div>
              )}

              {activeSubTab === 'manager-accounts' && (
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-4 sm:p-6">
                    <ManagerAccountManagement userBranch={userBranch} isManager={isManager} />
                  </div>
                </div>
              )}
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
            <div className="space-y-6">
              {/* 보고서 서브탭 네비게이션 */}
              <div className="bg-white shadow rounded-lg">
                <div className="border-b border-gray-200">
                  <nav className="-mb-px flex space-x-8 px-6">
                    <button
                      onClick={() => handleSubTabChange('work-report')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeSubTab === 'work-report'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      근무보고서
                    </button>
                    <button
                      onClick={() => handleSubTabChange('payroll-report')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeSubTab === 'payroll-report'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      급여보고서
                    </button>
                  </nav>
                </div>
              </div>

              {/* 서브탭 내용 */}
              {activeSubTab === 'work-report' && (
                <ReportManagement />
              )}
              
              {activeSubTab === 'payroll-report' && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">급여보고서</h3>
                  <div className="text-center py-12">
                    <div className="text-gray-500 text-lg mb-4">급여보고서 기능</div>
                    <p className="text-gray-400">급여 관련 보고서 기능이 여기에 구현될 예정입니다.</p>
                    <div className="mt-6">
                      <button
                        disabled
                        className="bg-gray-300 text-gray-500 px-6 py-2 rounded-md font-medium cursor-not-allowed"
                      >
                        개발 예정
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'payroll' && (
            <div className="space-y-6">
              {/* 급여작업 서브탭 네비게이션 */}
              <div className="bg-white shadow rounded-lg">
                <div className="border-b border-gray-200">
                  <nav className="-mb-px flex space-x-8 px-6">
                    <button
                      onClick={() => handleSubTabChange('work-comparison')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeSubTab === 'work-comparison'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      근무시간 비교
                    </button>
                    {!isManager && (
                      <>
                        <button
                          onClick={() => handleSubTabChange('tax-file')}
                          className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeSubTab === 'tax-file'
                              ? 'border-blue-500 text-blue-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          세무사 전송파일 생성
                        </button>
                        <button
                          onClick={() => handleSubTabChange('payroll-file')}
                          className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeSubTab === 'payroll-file'
                              ? 'border-blue-500 text-blue-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          급여이체파일 생성
                        </button>
                      </>
                    )}
                  </nav>
                </div>
              </div>

              {/* 서브탭 콘텐츠 */}
              {activeSubTab === 'work-comparison' && (
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-4 sm:p-6">
                    <WorkTimeComparison userBranch={userBranch} isManager={isManager} />
                  </div>
                </div>
              )}
              
              {activeSubTab === 'tax-file' && (
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-4 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      세무사 전송파일 생성
                    </h3>
                    <p className="text-sm text-gray-700 mb-4">
                      급여 관련 데이터를 세무사 전송용 Excel 파일로 생성합니다.
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                      <p className="text-sm text-yellow-800">
                        <strong>개발 예정:</strong> 이 기능은 향후 구현될 예정입니다.
                      </p>
                    </div>
                    <div className="mt-4">
                      <button
                        disabled
                        className="bg-gray-300 text-gray-500 px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed"
                      >
                        Excel 파일 다운로드 (개발 예정)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === 'payroll-file' && (
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-4 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      급여이체파일 생성
                    </h3>
                    <p className="text-sm text-gray-700 mb-4">
                      급여 이체용 Excel 파일을 생성합니다.
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                      <p className="text-sm text-yellow-800">
                        <strong>개발 예정:</strong> 이 기능은 향후 구현될 예정입니다.
                      </p>
                    </div>
                    <div className="mt-4">
                      <button
                        disabled
                        className="bg-gray-300 text-gray-500 px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed"
                      >
                        Excel 파일 다운로드 (개발 예정)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === '' && (
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-4 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      급여작업
                    </h3>
                    <p className="text-sm text-gray-700">
                      급여 관련 작업을 선택해주세요.
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <button
                        onClick={() => handleSubTabChange('work-comparison')}
                        className="bg-blue-50 p-4 rounded-lg hover:bg-blue-100 transition-colors duration-200 cursor-pointer text-left w-full"
                      >
                        <h4 className="font-medium text-blue-900">근무시간 비교</h4>
                        <p className="text-blue-600 text-sm">스케줄과 실제 근무시간을 비교합니다</p>
                      </button>
                      {!isManager && (
                        <>
                          <button
                            onClick={() => handleSubTabChange('tax-file')}
                            className="bg-green-50 p-4 rounded-lg hover:bg-green-100 transition-colors duration-200 cursor-pointer text-left w-full"
                          >
                            <h4 className="font-medium text-green-900">세무사 전송파일 생성</h4>
                            <p className="text-green-600 text-sm">급여 데이터를 Excel로 생성합니다</p>
                          </button>
                          <button
                            onClick={() => handleSubTabChange('payroll-file')}
                            className="bg-purple-50 p-4 rounded-lg hover:bg-purple-100 transition-colors duration-200 cursor-pointer text-left w-full"
                          >
                            <h4 className="font-medium text-purple-900">급여이체파일 생성</h4>
                            <p className="text-purple-600 text-sm">급여 이체용 Excel 파일을 생성합니다</p>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}