import { UserModel } from '../models/user.js';

export interface UserDoc {
  id: string;
  email: string;
  passwordHash: string;
}

export const userRepo = {
  async findByEmail(email: string): Promise<UserDoc | null> {
    const user = await UserModel.findOne({ email });
    if (!user) return null;
    return { id: user.id as string, email: user.email, passwordHash: user.passwordHash };
  },

  async findById(id: string): Promise<UserDoc | null> {
    const user = await UserModel.findById(id);
    if (!user) return null;
    return { id: user.id as string, email: user.email, passwordHash: user.passwordHash };
  },

  async create(email: string, passwordHash: string): Promise<UserDoc> {
    const user = await UserModel.create({ email, passwordHash });
    return { id: user.id as string, email: user.email, passwordHash: user.passwordHash };
  },

  async saveRefreshToken(userId: string, token: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, { $push: { refreshTokens: token } });
  },

  async hasRefreshToken(token: string): Promise<boolean> {
    const user = await UserModel.findOne({ refreshTokens: token });
    return user !== null;
  },

  async deleteRefreshToken(token: string): Promise<void> {
    await UserModel.findOneAndUpdate(
      { refreshTokens: token },
      { $pull: { refreshTokens: token } }
    );
  },
};
