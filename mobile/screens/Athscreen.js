// screens/AuthScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from '../utils/api';

const C = {
  bg: '#080c08', card: '#0f140f', border: '#1a271a',
  green: '#4ade80', greenDark: '#16a34a',
  text: '#dff0df', muted: '#5a7a5a', red: '#f87171',
};

export default function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập đầy đủ thông tin');
      return;
    }
    if (mode === 'register' && !email.trim()) {
      Alert.alert('Thiếu email', 'Vui lòng nhập email');
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login'
        ? { username: username.trim(), password }
        : { username: username.trim(), email: email.trim(), password };
      const data = await apiCall(endpoint, 'POST', body);
      await AsyncStorage.setItem('mcpe_token', data.token);
      await AsyncStorage.setItem('mcpe_user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (e) {
      Alert.alert('Lỗi', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={s.header}>
          <Text style={s.logo}>⛏</Text>
          <Text style={s.appName}>MULTIPLAYER</Text>
          <Text style={s.appSub}>for Minecraft PE</Text>
        </View>

        {/* Tab */}
        <View style={s.tabRow}>
          <TouchableOpacity style={[s.tab, mode === 'login' && s.tabActive]} onPress={() => setMode('login')}>
            <Text style={[s.tabText, mode === 'login' && s.tabTextActive]}>ĐĂNG NHẬP</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, mode === 'register' && s.tabActive]} onPress={() => setMode('register')}>
            <Text style={[s.tabText, mode === 'register' && s.tabTextActive]}>ĐĂNG KÝ</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={s.card}>
          <Text style={s.label}>USERNAME</Text>
          <TextInput
            style={s.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Tên người dùng..."
            placeholderTextColor={C.muted}
            autoCapitalize="none"
          />

          {mode === 'register' && (
            <>
              <Text style={s.label}>EMAIL</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                placeholderTextColor={C.muted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </>
          )}

          <Text style={s.label}>PASSWORD</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Mật khẩu (tối thiểu 6 ký tự)"
            placeholderTextColor={C.muted}
            secureTextEntry
          />

          <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#0a0e0a" />
              : <Text style={s.submitText}>{mode === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN'}</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>Không liên kết với Mojang / Microsoft</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 56, marginBottom: 12 },
  appName: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier New', fontSize: 22, color: C.green, letterSpacing: 4, fontWeight: '900' },
  appSub: { fontSize: 13, color: C.muted, marginTop: 4 },
  tabRow: { flexDirection: 'row', borderWidth: 1, borderColor: C.border, marginBottom: 24, backgroundColor: C.card },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { backgroundColor: C.green },
  tabText: { fontSize: 12, fontWeight: '800', color: C.muted },
  tabTextActive: { color: '#0a0e0a' },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 24 },
  label: { fontSize: 10, fontWeight: '800', color: C.muted, marginBottom: 8, letterSpacing: 2 },
  input: {
    borderWidth: 1, borderColor: C.border, backgroundColor: C.bg,
    color: C.text, padding: 12, fontSize: 14, marginBottom: 20,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  submitBtn: {
    backgroundColor: C.green, padding: 16, alignItems: 'center', marginTop: 8,
  },
  submitText: { color: '#0a0e0a', fontWeight: '900', fontSize: 14, letterSpacing: 2 },
  footer: { textAlign: 'center', color: C.muted, fontSize: 11, marginTop: 32 },
});
