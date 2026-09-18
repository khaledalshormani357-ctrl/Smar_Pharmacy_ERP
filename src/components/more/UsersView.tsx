import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Lock,
  UserCheck,
  UserX,
  X,
  ShieldAlert,
  Info
} from 'lucide-react';
import { db } from '../../db/sqlite';
import { PasswordSecurity } from '../../utils/security';
import { User, Role } from '../../types';

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<User[]>(db.getState().users || []);
  const [roles] = useState<Role[]>(db.getState().roles || []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showRolesMatrix, setShowRolesMatrix] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleId, setRoleId] = useState('pharmacist');
  const [pinCode, setPinCode] = useState('');
  const [password, setPassword] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const refreshUsers = () => {
    setUsers([...(db.getState().users || [])]);
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setUsername('');
    setFullName('');
    setRoleId('pharmacist');
    setPinCode('');
    setPassword('');
    setBiometricEnabled(false);
    setShowAddModal(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setUsername(user.username);
    setFullName(user.full_name);
    setRoleId(user.role_id);
    setPinCode(user.pin_code || '');
    setPassword('');
    setBiometricEnabled(user.biometric_enabled || false);
    setShowAddModal(true);
  };

  const handleToggleActive = (user: User) => {
    if (user.username === 'admin') {
      setMessage({ text: 'لا يمكن تعطيل حساب المدير الرئيسي (admin).', type: 'error' });
      return;
    }

    try {
      db.transaction(() => {
        const state = db.getState();
        const target = state.users.find((u) => u.id === user.id);
        if (target) {
          target.is_active = !target.is_active;
          target.updated_at = Date.now();
        }
      });
      refreshUsers();
      setMessage({
        text: `تم ${user.is_active ? 'تعطيل' : 'تفعيل'} المستخدم (${user.full_name}) بنجاح.`,
        type: 'success'
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || 'حدث خطأ أثناء تعديل حالة الحساب', type: 'error' });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!username.trim() || !fullName.trim()) {
        setMessage({ text: 'اسم المستخدم والاسم الكامل إلزاميان.', type: 'error' });
        return;
      }

      if (pinCode && !/^\d{4,6}$/.test(pinCode.trim())) {
        setMessage({ text: 'رمز PIN يجب أن يتكون من 4 إلى 6 أرقام فقط.', type: 'error' });
        return;
      }

      if (!editingUser && !password) {
        setMessage({ text: 'كلمة المرور مطلوبة للمستخدم الجديد.', type: 'error' });
        return;
      }

      db.transaction(() => {
        const state = db.getState();
        const now = Date.now();

        if (editingUser) {
          const target = state.users.find((u) => u.id === editingUser.id);
          if (!target) throw new Error('المستخدم غير موجود.');

          target.full_name = fullName.trim();
          target.role_id = roleId;
          target.biometric_enabled = biometricEnabled;
          if (pinCode.trim()) target.pin_code = pinCode.trim();
          if (password) {
            target.password_hash = PasswordSecurity.hashSync(password);
          }
          target.updated_at = now;
        } else {
          // Check username duplicate
          if (state.users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
            throw new Error(`اسم المستخدم (${username.trim()}) مستخدم مسبقاً.`);
          }

          const newUser: User = {
            id: 'usr-' + Math.random().toString(36).substring(2, 9),
            username: username.trim().toLowerCase(),
            full_name: fullName.trim(),
            password_hash: PasswordSecurity.hashSync(password),
            pin_code: pinCode.trim() || '1234',
            role_id: roleId,
            biometric_enabled: biometricEnabled,
            is_active: true,
            created_at: now,
            updated_at: now
          };
          state.users.push(newUser);
        }
      });

      refreshUsers();
      setShowAddModal(false);
      setMessage({
        text: editingUser ? 'تم تحديث بيانات المستخدم بنجاح.' : 'تم إضافة المستخدم الجديد بنجاح.',
        type: 'success'
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || 'فشل حفظ بيانات المستخدم', type: 'error' });
    }
  };

  const getRoleLabel = (rId: string) => {
    switch (rId) {
      case 'admin':
        return { label: 'مدير النظام الكامل', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'pharmacist':
        return { label: 'صيدلي ممارس', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'cashier':
        return { label: 'كاشير / نقطة بيع', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'storekeeper':
        return { label: 'أمين مخزن', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'manager':
        return { label: 'مدير الصيدلية', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
      default:
        return { label: rId, bg: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">إدارة المستخدمين وصلاحيات الأدوار</h3>
            <p className="text-xs text-slate-500">
              تحديد صلاحيات الصيادلة والكاشير، وتعيين رموز المرور السريعة PIN والبصمة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRolesMatrix(true)}
            className="px-3.5 py-2.5 rounded-2xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Shield className="w-4 h-4 text-slate-500" />
            <span>مصفوفة الصلاحيات</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة مستخدم جديد</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-2.5 text-xs font-bold border animate-in fade-in ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Users List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {users.map((u) => {
          const roleBadge = getRoleLabel(u.role_id);
          return (
            <div
              key={u.id}
              className={`bg-white rounded-3xl p-5 border transition-all shadow-xs space-y-4 ${
                u.is_active ? 'border-slate-200/80' : 'border-slate-200 opacity-60 bg-slate-50/50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 font-bold text-base flex items-center justify-center font-mono">
                    {u.full_name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-800">{u.full_name}</h4>
                      {!u.is_active && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          معطل
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 font-mono">@{u.username}</span>
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${roleBadge.bg}`}>
                  {roleBadge.label}
                </span>
              </div>

              {/* Security Badges */}
              <div className="flex items-center gap-4 text-xs text-slate-600 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>رمز PIN: {u.pin_code ? 'مفعل (••••)' : 'غير محدد'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Fingerprint className="w-3.5 h-3.5 text-slate-400" />
                  <span>البصمة: {u.biometric_enabled ? 'مفعلة' : 'غير مفعلة'}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleToggleActive(u)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                    u.is_active
                      ? 'text-rose-600 hover:bg-rose-50'
                      : 'text-emerald-600 hover:bg-emerald-50'
                  }`}
                >
                  {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                  <span>{u.is_active ? 'تعطيل الحساب' : 'تنشيط الحساب'}</span>
                </button>

                <button
                  onClick={() => handleOpenEdit(u)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>تعديل</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  {editingUser ? `تعديل المستخدم: ${editingUser.full_name}` : 'إضافة مستخدم جديد'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم (Username) *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingUser}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 focus:outline-hidden focus:border-blue-500 disabled:bg-slate-100 text-left"
                    placeholder="e.g. ahmed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-blue-500"
                    placeholder="د. أحمد عبدالله"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الدور والصلاحية *</label>
                  <select
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="pharmacist">صيدلي (مبيعات + مخزون + فواتير)</option>
                    <option value="cashier">كاشير (نقطة بيع + صندوق الوردية)</option>
                    <option value="storekeeper">أمين مخزن (مشتريات وجرد فقط)</option>
                    <option value="manager">مدير الصيدلية (كامل الصلاحيات عدا النظام)</option>
                    <option value="admin">مدير النظام (جميع الصلاحيات)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رمز الدخول السريع (PIN)</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 text-center font-mono tracking-widest"
                    placeholder="4-6 أرقام"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كلمة المرور {editingUser ? '(اتركها فارغة إذا لم ترغب بتغييرها)' : '*'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 font-mono"
                    placeholder="••••••••"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-blue-600" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">تسجيل الدخول بالبصمة البيومترية</span>
                      <span className="text-[10px] text-slate-500">تمكين فتح شاشة القفل ببصمة الأصبع على الأجهزة الداعمة</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={biometricEnabled}
                    onChange={(e) => setBiometricEnabled(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded-md"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
                >
                  {editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Matrix Modal */}
      {showRolesMatrix && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">مصفوفة الصلاحيات حسب الأدوار القياسية</h3>
              </div>
              <button
                onClick={() => setShowRolesMatrix(false)}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">الصلاحية / الميزة</th>
                      <th className="p-3 text-center">مدير النظام</th>
                      <th className="p-3 text-center">مدير صيدلية</th>
                      <th className="p-3 text-center">صيدلي</th>
                      <th className="p-3 text-center">كاشير</th>
                      <th className="p-3 text-center">أمين مخزن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-3 font-bold text-slate-800">البيع وإصدار الفواتير</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-slate-800">مرتجعات المبيعات</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-slate-800">تسجيل فواتير المشتريات والتوريد</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-slate-800">تعديل المخزون والجرد السنوي</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-slate-800">صرف المصاريف والتحويلات المالية</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-slate-800">تقارير الأرباح والتقييم المالي</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-slate-800">إدارة المستخدمين وإعدادات الصيدلية</td>
                      <td className="p-3 text-center text-emerald-600">✓</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                      <td className="p-3 text-center text-slate-300">✕</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
