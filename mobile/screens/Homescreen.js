// screens/HomeScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  RefreshControl, ActivityIndicator, Alert, Platform, Linking, Modal,
  ScrollView, Animated
} from 'react-native';
import { apiCall, MC_VERSIONS, GAME_MODES, SERVER_URL } from '../utils/api';
import io from 'socket.io-client';

const C = {
  bg: '#080c08', bg2: '#0d110d', card: '#0f140f', card2: '#141a14',
  border: '#1a271a', border2: '#223022',
  green: '#4ade80', greenDark: '#16a34a',
  text: '#dff0df', muted: '#5a7a5a', red: '#f87171', yellow: '#fbbf24', blue: '#60a5fa',
};

const MCPE_PACKAGE = 'com.mojang.minecraftpe';

function openMinecraft(relayHost, relayPort) {
  // Deep link: minecraft://connect?serverAddress=IP&serverPort=PORT
  // hoặc mở app qua intent
  const url = `minecraft://connect?serverAddress=${relayHost}&serverPort=${relayPort}`;
  Linking.canOpenURL(url).then(supported => {
    if (supported) {
      Linking.openURL(url);
    } else {
      // Fallback: open Play Store
      Linking.openURL(`market://details?id=${MCPE_PACKAGE}`);
    }
  });
}

function launchMinecraftForHost() {
  Linking.openURL(`minecraft://`).catch(() => {
    Linking.openURL(`market://details?id=${MCPE_PACKAGE}`);
  });
}

export default function HomeScreen({ user, socket }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [versionFilter, setVersionFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const [myRoom, setMyRoom] = useState(null);

  // Create room form
  const [roomName, setRoomName] = useState('');
  const [selectedVersion, setSelectedVersion] = useState(MC_VERSIONS[MC_VERSIONS.length - 1]);
  const [selectedMode, setSelectedMode] = useState('Survival');
  const [mapName, setMapName] = useState('My World');
  const [maxPlayers, setMaxPlayers] = useState('10');
  const [creating, setCreating] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (versionFilter) params.append('version', versionFilter);
      if (modeFilter) params.append('mode', modeFilter);
      const data = await apiCall(`/rooms?${params}`);
      setRooms(data);
    } catch (e) {
      console.warn('Load rooms error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, versionFilter, modeFilter]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Socket realtime
  useEffect(() => {
    if (!socket) return;
    const onCreated = (room) => setRooms(prev => [room, ...prev.filter(r => r._id !== room._id)]);
    const onDeleted = ({ roomId }) => setRooms(prev => prev.filter(r => r._id !== roomId));
    const onOffline = ({ roomId }) => setRooms(prev => prev.filter(r => r._id !== roomId));
    const onPlayerJoined = ({ roomId }) => setRooms(prev => prev.map(r => r._id === roomId ? { ...r, playerCount: r.playerCount + 1 } : r));
    socket.on('room:created', onCreated);
    socket.on('room:deleted', onDeleted);
    socket.on('room:offline', onOffline);
    socket.on('room:playerJoined', onPlayerJoined);
    return () => {
      socket.off('room:created', onCreated);
      socket.off('room:deleted', onDeleted);
      socket.off('room:offline', onOffline);
      socket.off('room:playerJoined', onPlayerJoined);
    };
  }, [socket]);

  async function handleCreateRoom() {
    if (!roomName.trim()) { Alert.alert('Thiếu tên phòng'); return; }
    setCreating(true);
    try {
      const data = await apiCall('/rooms', 'POST', {
        name: roomName.trim(),
        version: selectedVersion.value,
        mapName: mapName.trim() || 'My World',
        gameMode: selectedMode,
        maxPlayers: parseInt(maxPlayers) || 10,
      });
      setMyRoom(data.room);
      setShowCreate(false);
      Alert.alert(
        '✅ Phòng đã tạo',
        `Relay: ${data.relay.host}:${data.relay.port}\n\nMinecraft sẽ mở ngay bây giờ. Tạo world LAN trong game như bình thường.`,
        [{ text: 'Mở Minecraft', onPress: () => launchMinecraftForHost() }]
      );
    } catch (e) {
      Alert.alert('Lỗi tạo phòng', e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleCloseMyRoom() {
    Alert.alert('Đóng phòng?', 'Tất cả người chơi sẽ bị ngắt kết nối.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đóng phòng', style: 'destructive',
        onPress: async () => {
          try {
            await apiCall('/rooms/my/close', 'POST');
            setMyRoom(null);
          } catch (e) { Alert.alert('Lỗi', e.message); }
        }
      }
    ]);
  }

  async function handleJoinRoom(room) {
    try {
      const data = await apiCall(`/rooms/${room._id}/join`, 'POST');
      const { host, port } = data.relay;
      Alert.alert(
        `🎮 Tham gia: ${room.name}`,
        `Phiên bản: ${room.version}\nChế độ: ${room.gameMode}\nChủ phòng: ${room.ownerName}\n\nMinecraft sẽ mở và hiển thị phòng trong danh sách local network.`,
        [{ text: 'Mở Minecraft', onPress: () => openMinecraft(host, port) }, { text: 'Hủy', style: 'cancel' }]
      );
    } catch (e) {
      Alert.alert('Không thể tham gia', e.message);
    }
  }

  const renderRoom = ({ item: room }) => (
    <TouchableOpacity style={s.roomCard} onPress={() => handleJoinRoom(room)} activeOpacity={0.8}>
      <View style={s.roomHeader}>
        <View style={s.roomDot} />
        <Text style={s.roomName} numberOfLines={1}>{room.name}</Text>
        <Text style={s.roomPlayers}>{room.playerCount}/{room.maxPlayers}</Text>
      </View>
      <View style={s.roomMeta}>
        <View style={s.tag}><Text style={s.tagText}>{room.version}</Text></View>
        <View style={[s.tag, s.tagBlue]}><Text style={[s.tagText, { color: C.blue }]}>{room.gameMode}</Text></View>
      </View>
      <View style={s.roomFooter}>
        <Text style={s.roomOwner}>👤 {room.ownerName}</Text>
        <Text style={s.roomMap}>🗺️ {room.mapName || 'World'}</Text>
      </View>
    </TouchableOpacity>
  );

  const versionsByYear = MC_VERSIONS.reduce((acc, v) => {
    if (!acc[v.year]) acc[v.year] = [];
    acc[v.year].push(v);
    return acc;
  }, {});

  return (
    <View style={s.root}>
      {/* My Room Banner */}
      {myRoom && (
        <View style={s.myRoomBanner}>
          <View style={{ flex: 1 }}>
            <Text style={s.myRoomLabel}>PHÒNG CỦA TÔI</Text>
            <Text style={s.myRoomName}>{myRoom.name}</Text>
          </View>
          <TouchableOpacity style={s.closeRoomBtn} onPress={handleCloseMyRoom}>
            <Text style={s.closeRoomText}>ĐÓNG</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search & Filter */}
      <View style={s.searchBar}>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="🔍 Tìm phòng..."
          placeholderTextColor={C.muted}
          onSubmitEditing={loadRooms}
        />
        <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
          <Text style={s.createBtnText}>+ TẠO PHÒNG</Text>
        </TouchableOpacity>
      </View>

      {/* Rooms List */}
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.green} size="large" /></View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={r => r._id}
          renderItem={renderRoom}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRooms(); }} tintColor={C.green} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏠</Text>
              <Text style={s.emptyText}>Không có phòng nào đang online</Text>
              <Text style={s.emptySub}>Hãy là người đầu tiên tạo phòng!</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* ─── CREATE ROOM MODAL ─── */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>🏠 TẠO PHÒNG MỚI</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={{ color: C.muted, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={s.formLabel}>TÊN PHÒNG</Text>
              <TextInput style={s.formInput} value={roomName} onChangeText={setRoomName} placeholder="VD: Survival cùng mình nhé" placeholderTextColor={C.muted} maxLength={50} />

              <Text style={s.formLabel}>PHIÊN BẢN MINECRAFT</Text>
              <TouchableOpacity style={s.versionSelector} onPress={() => setShowVersionPicker(true)}>
                <Text style={s.versionText}>{selectedVersion.label}</Text>
                <Text style={{ color: C.muted }}>▼</Text>
              </TouchableOpacity>

              <Text style={s.formLabel}>TÊN MAP</Text>
              <TextInput style={s.formInput} value={mapName} onChangeText={setMapName} placeholder="My World" placeholderTextColor={C.muted} />

              <Text style={s.formLabel}>CHẾ ĐỘ CHƠI</Text>
              <View style={s.modeRow}>
                {GAME_MODES.map(m => (
                  <TouchableOpacity key={m} style={[s.modeBtn, selectedMode === m && s.modeBtnActive]} onPress={() => setSelectedMode(m)}>
                    <Text style={[s.modeBtnText, selectedMode === m && s.modeBtnTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>SỐ NGƯỜI TỐI ĐA</Text>
              <TextInput style={s.formInput} value={maxPlayers} onChangeText={setMaxPlayers} keyboardType="number-pad" placeholder="10" placeholderTextColor={C.muted} />

              <View style={s.infoBox}>
                <Text style={s.infoText}>⚡ Sau khi tạo phòng, Minecraft sẽ tự động mở. Vào game tạo world LAN như bình thường – server sẽ lo relay cho bạn bè tham gia.</Text>
              </View>

              <TouchableOpacity style={[s.submitBtn, creating && { opacity: 0.6 }]} onPress={handleCreateRoom} disabled={creating}>
                {creating ? <ActivityIndicator color="#0a0e0a" /> : <Text style={s.submitText}>🚀 TẠO PHÒNG VÀ MỞ MINECRAFT</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── VERSION PICKER MODAL ─── */}
      <Modal visible={showVersionPicker} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { maxHeight: '90%' }]}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>CHỌN PHIÊN BẢN</Text>
              <TouchableOpacity onPress={() => setShowVersionPicker(false)}>
                <Text style={{ color: C.muted, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {Object.entries(versionsByYear).reverse().map(([year, versions]) => (
                <View key={year}>
                  <Text style={s.yearHeader}>{year}</Text>
                  {versions.map(v => (
                    <TouchableOpacity key={v.value} style={[s.versionItem, selectedVersion.value === v.value && s.versionItemActive]}
                      onPress={() => { setSelectedVersion(v); setShowVersionPicker(false); }}>
                      <Text style={[s.versionItemText, selectedVersion.value === v.value && { color: C.green }]}>{v.label}</Text>
                      {selectedVersion.value === v.value && <Text style={{ color: C.green }}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  myRoomBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(74,222,128,0.1)', borderBottomWidth: 1, borderColor: C.green,
    padding: 16,
  },
  myRoomLabel: { fontSize: 9, color: C.green, fontWeight: '900', letterSpacing: 2, marginBottom: 4 },
  myRoomName: { fontSize: 15, color: C.text, fontWeight: '800' },
  closeRoomBtn: { backgroundColor: 'rgba(248,113,113,0.15)', borderWidth: 1, borderColor: C.red, padding: 10 },
  closeRoomText: { color: C.red, fontSize: 11, fontWeight: '800' },
  searchBar: { flexDirection: 'row', gap: 10, padding: 16, borderBottomWidth: 1, borderColor: C.border },
  searchInput: {
    flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    color: C.text, padding: 10, fontSize: 14,
  },
  createBtn: { backgroundColor: C.green, padding: 10, justifyContent: 'center' },
  createBtnText: { color: '#0a0e0a', fontWeight: '900', fontSize: 11 },
  roomCard: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    margin: 12, marginBottom: 0, padding: 16,
  },
  roomHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  roomDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, marginRight: 10 },
  roomName: { flex: 1, fontSize: 16, fontWeight: '800', color: C.text },
  roomPlayers: { fontSize: 12, color: C.muted, fontWeight: '700' },
  roomMeta: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tag: { backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: C.green, paddingHorizontal: 10, paddingVertical: 4 },
  tagBlue: { backgroundColor: 'rgba(96,165,250,0.1)', borderColor: C.blue },
  tagText: { fontSize: 11, fontWeight: '800', color: C.green },
  roomFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  roomOwner: { fontSize: 12, color: C.muted },
  roomMap: { fontSize: 12, color: C.muted },
  empty: { alignItems: 'center', padding: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 16, color: C.muted, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 13, color: C.muted },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modal: { backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border, maxHeight: '85%' },
  modalHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderColor: C.border,
  },
  modalTitle: { fontSize: 12, fontWeight: '900', color: C.green, letterSpacing: 1 },
  modalBody: { padding: 20 },
  formLabel: { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 2, marginBottom: 8 },
  formInput: {
    borderWidth: 1, borderColor: C.border, backgroundColor: C.bg,
    color: C.text, padding: 12, fontSize: 14, marginBottom: 20,
  },
  versionSelector: {
    borderWidth: 1, borderColor: C.border, backgroundColor: C.bg,
    padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  versionText: { color: C.text, fontSize: 14 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  modeBtnActive: { backgroundColor: C.green, borderColor: C.green },
  modeBtnText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  modeBtnTextActive: { color: '#0a0e0a' },
  infoBox: { backgroundColor: 'rgba(74,222,128,0.06)', borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 20 },
  infoText: { color: C.muted, fontSize: 13, lineHeight: 20 },
  submitBtn: { backgroundColor: C.green, padding: 16, alignItems: 'center', marginBottom: 32 },
  submitText: { color: '#0a0e0a', fontWeight: '900', fontSize: 13 },
  // Version picker
  yearHeader: { padding: 12, paddingTop: 20, fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 2, backgroundColor: C.bg2 },
  versionItem: { padding: 16, borderBottomWidth: 1, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between' },
  versionItemActive: { backgroundColor: 'rgba(74,222,128,0.06)' },
  versionItemText: { fontSize: 14, color: C.text },
});
