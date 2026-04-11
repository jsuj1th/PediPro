export type UserRole = 'staff' | 'admin' | 'parent';

export type AuthContext = {
  id: string;
  role: UserRole;
  practiceId: string;
  email: string;
};

export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};
