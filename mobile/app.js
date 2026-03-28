// App.js - Expo entry point
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Platform, StatusBar,
  TouchableOpacity, Animated
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';

import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import SocialScreen from './screens/SocialScreen';
import FriendsScreen from './screens/FriendsScreen';
import ProfileScreen from './screens/ProfileScreen';
import { SERVER_URL } from './utils/api';

const C = {
  bg: '#080c08', bg2: '#0d110d', card: '#0f140f',
  border: '#1a271a', green: '#4ade80', greenDark: '#16a34a',
  text: '#dff0df', muted: '#5a7a5a', red: '#f87171',
};

const TABS = [
  { key: 'home', label: 'Phòng', icon: '🏠' },
  { key: 'social', label: 'Xã hội', icon: '📱' },
  { key: 'friends', label: 'Bạn bè', icon: '👥' },
  { key: 'profile', label: 'Profile', icon: '👤' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [socket, setSocket] = useState(null);
  const [unread, setUnread] = useState(0);
  const tabAnim = useRef(new Animated.Value(0)).current;

  // Check saved session
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('mcpe_token');
        const saved = await AsyncStorage.getItem('mcpe_user');
        if (token && saved) {
          const u = JSON.parse(saved);
          setUser(u);
          connectSocket(token);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  function connectSocket(token) {
    const s = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    s.on('connect', () => {
      s.emit('auth', token);
      console.log('[Socket] Connected');
    });
    s.on('notification:broadcast', ({ title, content }) => {
      setUnread(prev => prev + 1);
    });
    s.on('notification:new', ({ title, content }) => {
      setUnread(prev => prev + 1);
    });
    s.on('account:banned', ({ banned }) => {
      if (banned) {
        AsyncStorage.multiRemove(['mcpe_token', 'mcpe_user']);
        setUser(null);
        setSocket(null);
        alert('Tài khoản của bạn đã bị ban.');
      }
    });
    s.on('disconnect', () => console.log('[Socket] Disconnected'));
    setSocket(s);
    return s;
  }

  function handleLogin(u) {
    setUser(u);
    AsyncStorage.setItem('mcpe_user', JSON.stringify(u));
    AsyncStorage.getItem('mcpe_token').then(t => { if (t) connectSocket(t); });
  }

  function handleLogout() {
    if (socket) { socket.disconnect(); setSocket(null); }
    setUser(null);
    setActiveTab('home');
  }

  function switchTab(key) {
    setActiveTab(key);
    if (key === 'profile') setUnread(0);
    Animated.spring(tabAnim, { toValue: TABS.findIndex(t => t.key === key), useNativeDriver: true }).start();
  }

  if (loading) {
    return (
      <View style={[s.root, s.center]}>
        <Text style={{ fontSize: 48 }}>⛏</Text>
        <Text style={s.loadingText}>MULTIPLAYER FOR MCPE</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <AuthScreen onLogin={handleLogin} />
      </>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg2} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerLogo}>⛏ MCPE</Text>
        <Text style={s.headerTitle}>{TABS.find(t => t.key === activeTab)?.label?.toUpperCase()}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Screen Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'home' && <HomeScreen user={user} socket={socket} />}
        {activeTab === 'social' && <SocialScreen user={user} socket={socket} />}
        {activeTab === 'friends' && <FriendsScreen user={user} socket={socket} />}
        {activeTab === 'profile' && <ProfileScreen user={user} onLogout={handleLogout} />}
      </View>

      {/* Bottom Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={s.tabItem}
              onPress={() => switchTab(tab.key)}
              activeOpacity={0.7}
            >
              <View style={[s.tabIconWrap, active && s.tabIconWrapActive]}>
                <Text style={s.tabIcon}>{tab.icon}</Text>
                {tab.key === 'profile' && unread > 0 && (
                  <View style={s.badge}><Text style={s.badgeText}>{unread}</Text></View>
                )}
              </View>
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadingText: {
    fontSize: 14, fontWeight: '900', color: C.green,
    letterSpacing: 3, marginTop: 16,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier New',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.bg2, borderBottomWidth: 1, borderColor: C.border,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 48,
    paddingBottom: 14, paddingHorizontal: 20,
  },
  headerLogo: {
    fontSize: 14, fontWeight: '900', color: C.green,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier New',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 12, fontWeight: '800', color: C.text, letterSpacing: 2,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier New',
  },
  tabBar: {
    flexDirection: 'row', backgroundColor: C.bg2,
    borderTopWidth: 1, borderColor: C.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 4 },
  tabIconWrap: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabIconWrapActive: { backgroundColor: 'rgba(74,222,128,0.12)' },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 10, color: C.muted, fontWeight: '700' },
  tabLabelActive: { color: C.green },
  badge: {
    position: 'absolute', top: -2, right: -4,
    backgroundColor: C.red, borderRadius: 10,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 9, color: '#fff', fontWeight: '900' },
});
