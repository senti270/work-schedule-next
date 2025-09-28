'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

interface FormDocument {
  id: string;
  branchId: string;
  branchName: string;
  formName: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  isBase64?: boolean;
}

interface Branch {
  id: string;
  name: string;
}

interface FormManagementProps {
  userBranch?: {
    id: string;
    name: string;
    managerId?: string;
  } | null;
  isManager: boolean;
  userId?: string;
}

const FormManagement: React.FC<FormManagementProps> = ({ userBranch, isManager, userId }) => {
  const [forms, setForms] = useState<FormDocument[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingForm, setEditingForm] = useState<FormDocument | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    formName: '',
    fileName: '',
    branchId: ''
  });

  const loadBranches = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'branches'));
      const branchesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
      }));
      
      // 한국어 알파벳 순으로 정렬
      branchesData.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setBranches(branchesData);

      // 매니저인 경우 자신의 지점을 기본 선택
      if (isManager && userBranch) {
        setSelectedBranchId(userBranch.id);
      } else if (branchesData.length > 0) {
        setSelectedBranchId(branchesData[0].id);
      }
    } catch (error) {
      console.error('지점 정보를 불러오는 중 오류:', error);
    }
  }, [isManager, userBranch]);

  const loadForms = useCallback(async () => {
    if (!selectedBranchId) return;
    
    try {
      let formsQuery;
      if (selectedBranchId === 'all') {
        // 전지점용인 경우 모든 서식 조회
        formsQuery = query(collection(db, 'formDocuments'));
      } else {
        // 특정 지점인 경우 해당 지점 서식만 조회
        formsQuery = query(
          collection(db, 'formDocuments'),
          where('branchId', '==', selectedBranchId)
        );
      }
      const querySnapshot = await getDocs(formsQuery);
      
      const formsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          branchId: data.branchId,
          branchName: data.branchName,
          formName: data.formName,
          fileName: data.fileName,
          fileUrl: data.fileUrl,
          fileSize: data.fileSize || 0,
          fileType: data.fileType || '',
          authorId: data.authorId,
          authorName: data.authorName,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          isBase64: data.isBase64 || false
        };
      });
      
      // 최종수정일 기준으로 정렬 (최신순)
      formsData.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      setForms(formsData);
    } catch (error) {
      console.error('서식 목록을 불러오는 중 오류:', error);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    if (selectedBranchId) {
      loadForms();
    }
  }, [selectedBranchId, loadForms]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.branchId) {
      alert('지점을 선택해주세요.');
      return;
    }
    
    if (!formData.formName.trim()) {
      alert('서식명을 입력해주세요.');
      return;
    }
    
    if (!selectedFile && !editingForm) {
      alert('파일을 선택해주세요.');
      return;
    }
    
    try {
      setUploadingFile(true);
      
      const selectedBranch = branches.find(b => b.id === formData.branchId);
      const authorName = isManager ? selectedBranch?.name || '매니저' : '관리자';
      
      let fileUrl = '';
      let fileName = '';
      let fileSize = 0;
      let fileType = '';
      // let isBase64 = false; // 사용하지 않음
      
      // 파일 업로드 (새 파일이 선택된 경우만)
      if (selectedFile) {
        fileName = selectedFile.name;
        fileSize = selectedFile.size;
        fileType = selectedFile.type;
        
        // 파일 크기 체크 (1MB - Base64 방식으로 임시 제한)
        if (fileSize > 1 * 1024 * 1024) {
          alert('파일 크기가 너무 큽니다. 1MB 이하의 파일로 업로드해주세요.\n\n현재 파일 크기: ' + (fileSize / 1024 / 1024).toFixed(1) + 'MB');
          setUploadingFile(false);
          return;
        }
        
        // Base64 방식으로 임시 처리 (Storage 규칙 설정 전까지)
        try {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
          
          fileUrl = await base64Promise;
          // isBase64 = true;
        } catch (base64Error) {
          console.error('Base64 변환 실패:', base64Error);
          throw new Error('파일 처리 중 오류가 발생했습니다. 파일을 다시 선택해주세요.');
        }
      }
      
      const formDocumentData = {
        branchId: formData.branchId,
        branchName: selectedBranch?.name || '',
        formName: formData.formName.trim(),
        fileName: fileName || editingForm?.fileName || '',
        fileUrl: fileUrl || editingForm?.fileUrl || '',
        fileSize: fileSize || editingForm?.fileSize || 0,
        fileType: fileType || editingForm?.fileType || '',
        authorId: userId || 'admin',
        authorName: authorName,
        updatedAt: new Date()
      };
      
      if (editingForm) {
        // 수정
        const formRef = doc(db, 'formDocuments', editingForm.id);
        await updateDoc(formRef, formDocumentData);
        alert('서식이 성공적으로 수정되었습니다.');
      } else {
        // 추가
        await addDoc(collection(db, 'formDocuments'), {
          ...formDocumentData,
          createdAt: new Date()
        });
        alert('서식이 성공적으로 추가되었습니다.');
      }
      
      await loadForms();
      resetForm();
    } catch (error) {
      console.error('서식 저장 중 오류:', error);
      alert(error instanceof Error ? error.message : '서식 저장 중 오류가 발생했습니다.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleEdit = (form: FormDocument) => {
    setEditingForm(form);
    setFormData({
      formName: form.formName,
      fileName: form.fileName,
      branchId: form.branchId
    });
    setShowAddForm(true);
  };

  const handleDelete = async (form: FormDocument) => {
    // 권한 체크
    if (isManager && form.authorId !== userId) {
      alert('본인이 작성한 서식만 삭제할 수 있습니다.');
      return;
    }
    
    if (!confirm(`'${form.formName}' 서식을 삭제하시겠습니까?`)) {
      return;
    }
    
    try {
      // 파일 삭제 (Firebase Storage에 있는 경우만)
      if (form.fileUrl && !form.fileUrl.startsWith('data:') && !form.isBase64) {
        try {
          const fileRef = ref(storage, form.fileUrl);
          await deleteObject(fileRef);
        } catch (fileError) {
          console.error('파일 삭제 실패:', fileError);
          // 파일 삭제 실패해도 문서 레코드는 삭제 진행
        }
      }
      
      // 문서 레코드 삭제
      await deleteDoc(doc(db, 'formDocuments', form.id));
      alert('서식이 성공적으로 삭제되었습니다.');
      
      await loadForms();
    } catch (error) {
      console.error('서식 삭제 중 오류:', error);
      alert('서식 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleFileDownload = (form: FormDocument) => {
    if (form.fileUrl) {
      const link = document.createElement('a');
      
      if (form.fileUrl.startsWith('data:') || form.isBase64) {
        // Base64 데이터인 경우
        link.href = form.fileUrl;
        link.download = form.fileName;
      } else {
        // Firebase Storage URL인 경우
        link.href = form.fileUrl;
        link.target = '_blank';
      }
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const resetForm = () => {
    setFormData({
      formName: '',
      fileName: '',
      branchId: ''
    });
    setEditingForm(null);
    setSelectedFile(null);
    setShowAddForm(false);
    
    // 파일 input 초기화
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
      (input as HTMLInputElement).value = '';
    });
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">서식 관리</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-medium"
        >
          서식 추가
        </button>
      </div>
      
      <p className="text-sm text-gray-600 mb-6">
        지점별로 필요한 서식을 업로드하고 관리합니다.
      </p>

      {/* 지점 선택 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">지점 선택</label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedBranchId('all')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              selectedBranchId === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            전지점용
          </button>
          {branches.map(branch => (
            <button
              key={branch.id}
              onClick={() => setSelectedBranchId(branch.id)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                selectedBranchId === branch.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {branch.name}
            </button>
          ))}
        </div>
      </div>


      {/* 서식 목록 */}
      {selectedBranchId && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            서식 목록 ({forms.length}개)
          </h3>
          
          {forms.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-lg text-gray-500">등록된 서식이 없습니다.</p>
              <p className="text-sm text-gray-400 mt-2">서식 추가 버튼을 클릭하여 새 서식을 등록하세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      서식명
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      파일정보
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      최종수정일
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      작성자
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {forms.map((form) => (
                    <tr key={form.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {form.formName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="space-y-1">
                          <div className="text-xs">
                            {form.fileName}
                          </div>
                          <div className="text-xs text-gray-400">
                            {form.fileSize ? `${(form.fileSize / 1024 / 1024).toFixed(1)}MB` : '-'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {form.updatedAt.toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {form.authorName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleFileDownload(form)}
                          className="text-green-600 hover:text-green-900"
                        >
                          다운로드
                        </button>
                        {(!isManager || form.authorId === userId) && (
                          <>
                            <button
                              onClick={() => handleEdit(form)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => handleDelete(form)}
                              className="text-red-600 hover:text-red-900"
                            >
                              삭제
                            </button>
                          </>
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

      {/* 서식 추가/수정 모달 */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingForm ? '서식 수정' : '새 서식 추가'}
                </h3>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    서식명 *
                  </label>
                  <input
                    type="text"
                    value={formData.formName}
                    onChange={(e) => setFormData({ ...formData, formName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="서식명을 입력하세요"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    지점 선택 *
                  </label>
                  <select
                    value={formData.branchId}
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">지점을 선택하세요</option>
                    <option value="all">전지점용</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    파일 선택 {!editingForm && '*'}
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // 파일 크기 체크
                        if (file.size > 1 * 1024 * 1024) {
                          alert('파일 크기가 너무 큽니다. 1MB 이하의 파일로 업로드해주세요.\n\n현재 파일 크기: ' + (file.size / 1024 / 1024).toFixed(1) + 'MB');
                          e.target.value = '';
                          return;
                        }
                        
                        const allowedTypes = [
                          'application/pdf', 
                          'application/msword', 
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'application/vnd.ms-excel',
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                          'image/jpeg', 
                          'image/jpg',
                          'image/png'
                        ];
                        
                        if (!allowedTypes.includes(file.type)) {
                          alert('지원되는 파일 형식: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG');
                          e.target.value = '';
                          return;
                        }
                        
                        setSelectedFile(file);
                        setFormData({ ...formData, fileName: file.name });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {selectedFile && (
                    <p className="text-xs text-gray-600 mt-1">
                      선택된 파일: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)}MB)
                    </p>
                  )}
                  {editingForm && !selectedFile && (
                    <p className="text-xs text-gray-500 mt-1">
                      현재 파일: {editingForm.fileName}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    PDF, DOC, DOCX, XLS, XLSX, JPG, PNG 파일을 업로드할 수 있습니다. (최대 1MB)
                  </p>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-medium"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={uploadingFile}
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium disabled:opacity-50"
                  >
                    {uploadingFile ? '저장중...' : (editingForm ? '수정' : '추가')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormManagement;
