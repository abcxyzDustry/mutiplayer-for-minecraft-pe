// screens/ProfileScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall, SERVER_URL } from '../utils/api';

const C = {
  bg: '#080c08', bg2: '#0d110d', card: '#0f140f',
  border: '#1a271a', green: '#4ade80', greenDark: '#16a34a',
  text: '#dff0df', muted: '#5a7a5a', red: '#f87171', yellow: '#fbbf24',
};

export default function ProfileScreen({ user, onLogout }) {
  const [profile, setProfile] = useState(user);
  const [bio, setBio] = useState(user?.bio || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      const data = await apiCall('/notifications');
      setNotifications(data.slice(0, 10));
      await apiCall('/notifications/read', 'PUT');
    } catch {}
  }

  async function saveBio() {
    setSaving(true);
    try {
      const updated = await apiCall('/auth/profile', 'PUT', { bio });
      setProfile(updated);
      setEditing(false);
    } catch (e) { Alert.alert('Lỗi', e.message); }
    setSaving(false);
  }

  async function handleLogout() {
    Alert.alert('Đăng xuất?', '', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove(['mcpe_token', 'mcpe_user']);
          onLogout();
        }
      }
    ]);
  }

  const unread = notifications.filter(n => !n.read).length;

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Profile Card */}
      <View style={s.profileCard}>
        <View style={s.bigAvatar}><Text style={{ fontSize: 40 }}>⛏</Text></View>
        <Text style={s.username}>{profile?.username}</Text>
        <Text style={s.email}>{profile?.email}</Text>
        {profile?.role === 'admin' && <View style={s.adminBadge}><Text style={s.adminText}>👑 ADMIN</Text></View>}
      </View>

      {/* Bio */}
      <View style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>BIO</Text>
          <TouchableOpacity onPress={() => editing ? saveBio() : setEditing(true)}>
            {saving ? <ActivityIndicator color={C.green} size="small" /> :
              <Text style={{ color: C.green, fontSize: 12, fontWeight: '800' }}>{editing ? 'LƯU' : 'SỬA'}</Text>
            }
          </TouchableOpacity>
        </View>
        {editing ? (
          <TextInput
            style={s.bioInput}
            value={bio}
            onChangeText={setBio}
            placeholder="Viết gì đó về bạn..."
            placeholderTextColor={C.muted}
            multiline maxLength={200}
          />
        ) : (
          <Text style={s.bioText}>{profile?.bio || 'Chưa có bio. Nhấn SỬA để thêm.'}</Text>
        )}
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Text style={s.statNum}>{notifications.length}</Text>
          <Text style={s.statLabel}>Thông báo</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statNum}>0</Text>
          <Text style={s.statLabel}>Bài viết</Text>
        </View>
        <View style={s.statBox}>
          <Text style={s.statNum}>0</Text>
          <Text style={s.statLabel}>Bạn bè</Text>
        </View>
      </View>

      {/* Notifications */}
      {notifications.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>THÔNG BÁO GẦN ĐÂY</Text>
          {notifications.map((n, i) => (
            <View key={i} style={s.notifCard}>
              <Text style={s.notifMsg}>📢 {n.message}</Text>
              <Text style={s.notifTime}>{new Date(n.createdAt).toLocaleDateString('vi-VN')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Settings */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>CÀI ĐẶT</Text>
        <View style={s.settingsCard}>
          <TouchableOpacity style={s.settingItem} onPress={() => Alert.alert('Server URL', SERVER_URL)}>
            <Text style={s.settingLabel}>🌐 Server URL</Text>
            <Text style={s.settingValue} numberOfLines={1}>{SERVER_URL}</Text>
          </TouchableOpacity>
          <View style={s.settingItem}>
            <Text style={s.settingLabel}>📱 Platform</Text>
            <Text style={s.settingValue}>{Platform.OS} {Platform.Version}</Text>
          </View>
          <View style={s.settingItem}>
            <Text style={s.settingLabel}>🎮 App Version</Text>
            <Text style={s.settingValue}>1.0.0</Text>
          </View>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>⏻ ĐĂNG XUẤT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  profileCard: { alignItems: 'center', padding: 32, borderBottomWidth: 1, borderColor: C.border },
  bigAvatar: {
    width: 88, height: 88, backgroundColor: C.greenDark,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    clipPath: undefined,
  },
  username: { fontSize: 22, fontWeight: '900', color: C.text, marginBottom: 4 },
  email: { fontSize: 13, color: C.muted, marginBottom: 12 },
  adminBadge: { backgroundColor: 'rgba(251,191,36,0.15)', borderWidth: 1, borderColor: C.yellow, paddingHorizontal: 14, paddingVertical: 4 },
  adminText: { color: C.yellow, fontSize: 11, fontWeight: '800' },
  section: { padding: 20 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: C.muted, letterSpacing: 2 },
  bioInput: { borderWidth: 1, borderColor: C.green, backgroundColor: C.card, color: C.text, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  bioText: { fontSize: 14, color: C.muted, lineHeight: 22 },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border },
  statBox: { flex: 1, alignItems: 'center', padding: 20, borderRightWidth: 1, borderColor: C.border },
  statNum: { fontSize: 22, fontWeight: '900', color: C.green, marginBottom: 4 },
  statLabel: { fontSize: 11, color: C.muted, fontWeight: '700' },
  notifCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8 },
  notifMsg: { fontSize: 13, color: C.text, lineHeight: 20, marginBottom: 6 },
  notifTime: { fontSize: 11, color: C.muted },
  settingsCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: C.border },
  settingLabel: { fontSize: 14, color: C.text, fontWeight: '600' },
  settingValue: { fontSize: 12, color: C.muted, maxWidth: '50%', textAlign: 'right' },
  logoutBtn: { margin: 20, borderWidth: 1, borderColor: C.red, padding: 16, alignItems: 'center' },
  logoutText: { color: C.red, fontWeight: '900', fontSize: 14 },
});
