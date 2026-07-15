import bcrypt from 'bcryptjs';
import { userRepo } from '../repositories/user.repository.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

const SALT_ROUNDS = 12;

export const authService = {
  async signup(email: string, password: string) {
    if (await userRepo.findByEmail(email)) {
      throw new Error('Email already in use');
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userRepo.create(email, passwordHash);
    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = signRefreshToken({ sub: user.id });
    await userRepo.saveRefreshToken(user.id, refreshToken);
    return { accessToken, refreshToken, user: { id: user.id, email: user.email } };
  },

  async signin(email: string, password: string) {
    const user = await userRepo.findByEmail(email);
    if (!user) throw new Error('Invalid credentials');
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) throw new Error('Invalid credentials');
    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = signRefreshToken({ sub: user.id });
    await userRepo.saveRefreshToken(user.id, refreshToken);
    return { accessToken, refreshToken, user: { id: user.id, email: user.email } };
  },

  async refresh(refreshToken: string) {
    if (!(await userRepo.hasRefreshToken(refreshToken))) {
      throw new Error('Invalid refresh token');
    }
    const payload = verifyRefreshToken(refreshToken);
    const user = await userRepo.findById(payload.sub);
    if (!user) throw new Error('User not found');
    await userRepo.deleteRefreshToken(refreshToken);
    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    const newRefreshToken = signRefreshToken({ sub: user.id });
    await userRepo.saveRefreshToken(user.id, newRefreshToken);
    return { accessToken, refreshToken: newRefreshToken };
  },

  async signout(refreshToken: string) {
    await userRepo.deleteRefreshToken(refreshToken);
  },
};
