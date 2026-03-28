// screens/FriendsScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  Modal, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { apiCall, SERVER_URL } from '../utils/api';

const C = {
  bg: '#080c08', bg2: '#0d110d', card: '#0f140f',
  border: '#1a271a', border2: '#223022',
  green: '#4ade80', greenDark: '#16a34a',
  text: '#dff0df', muted: '#5a7a5a', red: '#f87171', blue: '#60a5fa',
};

export default function FriendsScreen({ user, socket }) {
  const [tab, setTab] = useState('friends'); // 'friends' | 'requests' | 'search'
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatUser, setChatUser] = useState(null); // user to chat with
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const flatListRef = useRef();

  const loadFriends = useCallback(async () => {
    try {
      const data = await apiCall('/friends');
      setFriends(data.friends);
      setRequests(data.requests);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadFriends(); }, []);

  useEffect(() => {
    if (!socket) return;
    const onRequest = ({ from, username }) => {
      setRequests(prev => [...prev, { _id: from, username }]);
      Alert.alert('Lời mời kết bạn', `${username} muốn kết bạn với bạn`);
    };
    const onAccepted = ({ by, username }) => {
      Alert.alert('Đã chấp nhận', `${username} đã chấp nhận lời mời kết bạn của bạn`);
      loadFriends();
    };
    const onMsg = (msg) => {
      if (chatUser && msg.sender === chatUser._id) {
        setMessages(prev => [...prev, msg]);
      }
    };
    socket.on('friend:request', onRequest);
    socket.on('friend:accepted', onAccepted);
    socket.on('message:new', onMsg);
    return () => {
      socket.off('friend:request', onRequest);
      socket.off('friend:accepted', onAccepted);
      socket.off('message:new', onMsg);
    };
  }, [socket, chatUser]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await apiCall(`/users/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(data);
    } catch {} finally { setSearching(false); }
  }

  async function sendFriendRequest(userId, username) {
    try {
      await apiCall(`/friends/request/${userId}`, 'POST');
      Alert.alert('Đã gửi', `Đã gửi lời mời kết bạn đến ${username}`);
    } catch (e) { Alert.alert('Lỗi', e.message); }
  }

  async function acceptRequest(userId) {
    try {
      await apiCall(`/friends/accept/${userId}`, 'POST');
      loadFriends();
    } catch (e) { Alert.alert('Lỗi', e.message); }
  }

  async function rejectRequest(userId) {
    try {
      await apiCall(`/friends/reject/${userId}`, 'POST');
      setRequests(prev => prev.filter(r => r._id !== userId));
    } catch {}
  }

  async function openChat(friend) {
    setChatUser(friend);
    try {
      const data = await apiCall(`/messages/${friend._id}`);
      setMessages(data);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {}
  }

  async function sendMessage() {
    if (!msgText.trim() || !chatUser) return;
    const text = msgText.trim();
    setMsgText('');
    try {
      const msg = await apiCall(`/messages/${chatUser._id}`, 'POST', { content: text });
      setMessages(prev => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { Alert.alert('Lỗi', e.message); }
  }

  const renderFriend = ({ item }) => (
    <TouchableOpacity style={s.friendCard} onPress={() => openChat(item)}>
      <View style={s.avatar}><Text style={{ fontSize: 18 }}>👤</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.friendName}>{item.username}</Text>
        <Text style={s.friendSub}>Nhấn để nhắn tin</Text>
      </View>
      <Text style={{ color: C.muted, fontSize: 18 }}>💬</Text>
    </TouchableOpacity>
  );

  const renderRequest = ({ item }) => (
    <View style={s.requestCard}>
      <View style={s.avatar}><Text style={{ fontSize: 18 }}>👤</Text></View>
      <Text style={s.friendName}>{item.username}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginLeft: 'auto' }}>
        <TouchableOpacity style={s.acceptBtn} onPress={() => acceptRequest(item._id)}>
          <Text style={s.acceptText}>✓ Chấp nhận</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.rejectBtn} onPress={() => rejectRequest(item._id)}>
          <Text style={s.rejectText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMessage = ({ item }) => {
    const isMe = item.sender === user?._id || item.sender?.toString() === user?._id?.toString();
    return (
      <View style={[s.msgWrapper, isMe && s.msgWrapperMe]}>
        <View style={[s.msgBubble, isMe && s.msgBubbleMe]}>
          <Text style={[s.msgText, isMe && s.msgTextMe]}>{item.content}</Text>
        </View>
        <Text style={s.msgTime}>{new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* Tabs */}
      <View style={s.tabRow}>
        {[
          { key: 'friends', label: `Bạn bè (${friends.length})` },
          { key: 'requests', label: `Lời mời (${requests.length})` },
          { key: 'search', label: '🔍 Tìm bạn' },
        ].map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Friends */}
      {tab === 'friends' && (
        loading ? <View style={s.center}><ActivityIndicator color={C.green} /></View> :
        <FlatList
          data={friends}
          keyExtractor={f => f._id}
          renderItem={renderFriend}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyIcon}>👥</Text><Text style={s.emptyText}>Chưa có bạn bè nào</Text></View>}
        />
      )}

      {/* Requests */}
      {tab === 'requests' && (
        <FlatList
          data={requests}
          keyExtractor={r => r._id}
          renderItem={renderRequest}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyIcon}>📬</Text><Text style={s.emptyText}>Không có lời mời nào</Text></View>}
        />
      )}

      {/* Search */}
      {tab === 'search' && (
        <View style={{ flex: 1 }}>
          <View style={s.searchBar}>
            <TextInput
              style={s.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Tìm tên người dùng..."
              placeholderTextColor={C.muted}
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity style={s.searchBtn} onPress={handleSearch}>
              {searching ? <ActivityIndicator color="#0a0e0a" size="small" /> : <Text style={s.searchBtnText}>TÌM</Text>}
            </TouchableOpacity>
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={u => u._id}
            renderItem={({ item }) => (
              <View style={s.friendCard}>
                <View style={s.avatar}><Text style={{ fontSize: 18 }}>👤</Text></View>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: C.text }}>{item.username}</Text>
                {friends.some(f => f._id === item._id) ? (
                  <Text style={{ color: C.green, fontSize: 12, fontWeight: '700' }}>✓ Bạn bè</Text>
                ) : (
                  <TouchableOpacity style={s.addBtn} onPress={() => sendFriendRequest(item._id, item.username)}>
                    <Text style={s.addBtnText}>+ Kết bạn</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🔍</Text>
                <Text style={s.emptyText}>Tìm kiếm người dùng</Text>
              </View>
            }
          />
        </View>
      )}

      {/* ─── CHAT MODAL ─── */}
      <Modal visible={!!chatUser} animationType="slide">
        <KeyboardAvoidingView style={s.chatRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Chat Header */}
          <View style={s.chatHeader}>
            <TouchableOpacity onPress={() => setChatUser(null)} style={{ padding: 4 }}>
              <Text style={{ color: C.green, fontSize: 20 }}>←</Text>
            </TouchableOpacity>
            <View style={s.avatar}><Text style={{ fontSize: 18 }}>👤</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.chatHeaderName}>{chatUser?.username}</Text>
              <Text style={{ fontSize: 11, color: C.green }}>Online</Text>
            </View>
          </View>

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m, i) => m._id || String(i)}
            renderItem={renderMessage}
            style={{ flex: 1, backgroundColor: C.bg }}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={s.center}><Text style={{ color: C.muted, marginTop: 40 }}>Bắt đầu cuộc trò chuyện...</Text></View>
            }
          />

          {/* Input */}
          <View style={s.chatInputRow}>
            <TextInput
              style={s.chatInput}
              value={msgText}
              onChangeText={setMsgText}
              placeholder="Nhắn tin..."
              placeholderTextColor={C.muted}
              multiline maxLength={500}
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity style={s.sendBtn} onPress={sendMessage}>
              <Text style={s.sendBtnText}>→</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderColor: C.green },
  tabText: { fontSize: 11, fontWeight: '800', color: C.muted },
  tabTextActive: { color: C.green },
  friendCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: C.border, gap: 12 },
  requestCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: C.border, gap: 12 },
  avatar: { width: 40, height: 40, backgroundColor: C.greenDark, alignItems: 'center', justifyContent: 'center' },
  friendName: { fontSize: 15, fontWeight: '800', color: C.text },
  friendSub: { fontSize: 12, color: C.muted },
  acceptBtn: { backgroundColor: 'rgba(74,222,128,0.15)', borderWidth: 1, borderColor: C.green, paddingHorizontal: 12, paddingVertical: 6 },
  acceptText: { color: C.green, fontSize: 12, fontWeight: '700' },
  rejectBtn: { borderWidth: 1, borderColor: C.border, padding: 6, paddingHorizontal: 10 },
  rejectText: { color: C.red, fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 15, color: C.muted, fontWeight: '700' },
  searchBar: { flexDirection: 'row', padding: 16, gap: 10, borderBottomWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, color: C.text, padding: 10, fontSize: 14 },
  searchBtn: { backgroundColor: C.green, padding: 10, justifyContent: 'center' },
  searchBtnText: { color: '#0a0e0a', fontWeight: '900', fontSize: 11 },
  addBtn: { backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: C.green, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: C.green, fontSize: 12, fontWeight: '700' },
  // Chat
  chatRoot: { flex: 1, backgroundColor: C.bg },
  chatHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.bg2 },
  chatHeaderName: { fontSize: 16, fontWeight: '800', color: C.text },
  msgWrapper: { marginBottom: 12, alignItems: 'flex-start', maxWidth: '75%' },
  msgWrapperMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgBubble: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 12 },
  msgBubbleMe: { backgroundColor: 'rgba(74,222,128,0.15)', borderColor: C.green },
  msgText: { fontSize: 14, color: C.muted, lineHeight: 20 },
  msgTextMe: { color: C.text },
  msgTime: { fontSize: 10, color: C.muted, marginTop: 4 },
  chatInputRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.border, padding: 12, gap: 10, backgroundColor: C.bg2 },
  chatInput: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, color: C.text, padding: 10, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: C.green, width: 44, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#0a0e0a', fontSize: 20, fontWeight: '900' },
});
