// screens/SocialScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  Modal, ScrollView, ActivityIndicator, Alert, Image, Linking
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { apiCall, POST_TYPES, API_URL, SERVER_URL } from '../utils/api';

const C = {
  bg: '#080c08', bg2: '#0d110d', card: '#0f140f',
  border: '#1a271a', border2: '#223022',
  green: '#4ade80', greenDark: '#16a34a',
  text: '#dff0df', muted: '#5a7a5a', red: '#f87171', yellow: '#fbbf24', blue: '#60a5fa',
};

const TYPE_COLORS = {
  post: C.blue, mod: C.green, addon: C.yellow, resource_pack: '#a78bfa', map: '#f472b6'
};
const TYPE_LABELS = { post: 'Bài viết', mod: 'Mod', addon: 'Addon', resource_pack: 'Resource Pack', map: 'Map' };

export default function SocialScreen({ user, socket }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [postContent, setPostContent] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postType, setPostType] = useState('post');
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [posting, setPosting] = useState(false);

  const loadPosts = useCallback(async (reset = false) => {
    const p = reset ? 1 : page;
    try {
      const data = await apiCall(`/posts?type=${activeFilter}&page=${p}`);
      if (reset) {
        setPosts(data.posts);
        setPage(1);
      } else {
        setPosts(prev => [...prev, ...data.posts]);
      }
      setHasMore(data.posts.length === 20);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter, page]);

  useEffect(() => {
    setLoading(true);
    loadPosts(true);
  }, [activeFilter]);

  useEffect(() => {
    if (!socket) return;
    const onNew = (post) => setPosts(prev => [post, ...prev]);
    const onDeleted = ({ postId }) => setPosts(prev => prev.filter(p => p._id !== postId));
    socket.on('post:new', onNew);
    socket.on('post:deleted', onDeleted);
    return () => { socket.off('post:new', onNew); socket.off('post:deleted', onDeleted); };
  }, [socket]);

  async function handleLike(postId) {
    try {
      const data = await apiCall(`/posts/${postId}/like`, 'POST');
      setPosts(prev => prev.map(p => p._id === postId ? { ...p, likeCount: data.likeCount } : p));
    } catch {}
  }

  async function handleDownload(post) {
    if (!post.fileUrl) return;
    await apiCall(`/posts/${post._id}/download`, 'POST');
    Linking.openURL(`${SERVER_URL}${post.fileUrl}`);
  }

  async function handlePost() {
    if (!postContent.trim() && !postTitle.trim()) { Alert.alert('Nhập nội dung bài viết'); return; }
    setPosting(true);
    try {
      const formData = new FormData();
      formData.append('content', postContent.trim());
      formData.append('type', postType);
      if (postTitle.trim()) formData.append('title', postTitle.trim());
      if (selectedImage) {
        formData.append('image', { uri: selectedImage.uri, type: selectedImage.type || 'image/jpeg', name: selectedImage.fileName || 'photo.jpg' });
      }
      await apiCall('/posts', 'POST', formData, true);
      setShowCreate(false);
      setPostContent(''); setPostTitle(''); setSelectedImage(null); setSelectedFile(null);
      loadPosts(true);
    } catch (e) { Alert.alert('Lỗi', e.message); } finally { setPosting(false); }
  }

  async function pickImage() {
    launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, res => {
      if (!res.didCancel && res.assets?.[0]) setSelectedImage(res.assets[0]);
    });
  }

  const renderPost = ({ item: post }) => (
    <View style={s.postCard}>
      {/* Header */}
      <View style={s.postHead}>
        <View style={s.postAvatar}><Text style={{ fontSize: 16 }}>👤</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.postAuthor}>{post.authorName}</Text>
          <Text style={s.postDate}>{new Date(post.createdAt).toLocaleDateString('vi-VN')}</Text>
        </View>
        <View style={[s.typeBadge, { backgroundColor: `${TYPE_COLORS[post.type]}20`, borderColor: TYPE_COLORS[post.type] }]}>
          <Text style={[s.typeBadgeText, { color: TYPE_COLORS[post.type] }]}>{TYPE_LABELS[post.type]}</Text>
        </View>
      </View>

      {/* Title */}
      {post.title ? <Text style={s.postTitle}>{post.title}</Text> : null}

      {/* Content */}
      <Text style={s.postContent}>{post.content}</Text>

      {/* Image */}
      {post.imageUrl ? (
        <Image source={{ uri: `${SERVER_URL}${post.imageUrl}` }} style={s.postImage} resizeMode="cover" />
      ) : null}

      {/* File */}
      {post.fileUrl ? (
        <TouchableOpacity style={s.fileCard} onPress={() => handleDownload(post)}>
          <Text style={s.fileIcon}>📦</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.fileName} numberOfLines={1}>{post.fileName}</Text>
            <Text style={s.fileSize}>{post.fileSize ? `${(post.fileSize / 1024 / 1024).toFixed(1)} MB` : ''} · {post.downloads} lượt tải</Text>
          </View>
          <Text style={{ color: C.green, fontWeight: '800' }}>↓</Text>
        </TouchableOpacity>
      ) : null}

      {/* Actions */}
      <View style={s.postActions}>
        <TouchableOpacity style={s.actionBtn} onPress={() => handleLike(post._id)}>
          <Text style={s.actionIcon}>❤️</Text>
          <Text style={s.actionText}>{post.likeCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn}>
          <Text style={s.actionIcon}>💬</Text>
          <Text style={s.actionText}>{post.comments?.length || 0}</Text>
        </TouchableOpacity>
        {post.fileUrl && (
          <TouchableOpacity style={s.actionBtn} onPress={() => handleDownload(post)}>
            <Text style={s.actionIcon}>⬇️</Text>
            <Text style={s.actionText}>Tải về</Text>
          </TouchableOpacity>
        )}
        {post.author === user?._id || post.authorName === user?.username ? (
          <TouchableOpacity style={s.actionBtn} onPress={async () => {
            Alert.alert('Xóa bài viết?', '', [
              { text: 'Hủy', style: 'cancel' },
              { text: 'Xóa', style: 'destructive', onPress: async () => {
                await apiCall(`/posts/${post._id}`, 'DELETE');
                setPosts(prev => prev.filter(p => p._id !== post._id));
              }}
            ]);
          }}>
            <Text style={{ color: C.red, fontSize: 12 }}>🗑️ Xóa</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {[{ label: 'Tất cả', value: '' }, ...POST_TYPES].map(t => (
          <TouchableOpacity key={t.value} style={[s.filterBtn, activeFilter === t.value && s.filterBtnActive]} onPress={() => setActiveFilter(t.value)}>
            <Text style={[s.filterText, activeFilter === t.value && s.filterTextActive]}>
              {t.icon ? `${t.icon} ` : ''}{t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.green} size="large" /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={p => p._id}
          renderItem={renderPost}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPosts(true); }} tintColor={C.green} />}
          onEndReached={() => { if (hasMore) { setPage(prev => prev + 1); loadPosts(); } }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📝</Text>
              <Text style={s.emptyText}>Chưa có bài viết nào</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* ─── CREATE POST MODAL ─── */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>✍️ ĐĂNG BÀI MỚI</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)}><Text style={{ color: C.muted, fontSize: 20 }}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={s.formLabel}>LOẠI BÀI VIẾT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {POST_TYPES.map(t => (
                    <TouchableOpacity key={t.value} style={[s.typeBtn, postType === t.value && s.typeBtnActive]} onPress={() => setPostType(t.value)}>
                      <Text style={[s.typeBtnText, postType === t.value && { color: '#0a0e0a' }]}>{t.icon} {t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {postType !== 'post' && (
                <>
                  <Text style={s.formLabel}>TIÊU ĐỀ</Text>
                  <TextInput style={s.formInput} value={postTitle} onChangeText={setPostTitle} placeholder="Tên mod/addon/pack..." placeholderTextColor={C.muted} />
                </>
              )}

              <Text style={s.formLabel}>NỘI DUNG / MÔ TẢ</Text>
              <TextInput
                style={[s.formInput, { minHeight: 100, textAlignVertical: 'top' }]}
                value={postContent} onChangeText={setPostContent}
                placeholder="Viết gì đó..." placeholderTextColor={C.muted}
                multiline
              />

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                <TouchableOpacity style={s.attachBtn} onPress={pickImage}>
                  <Text style={{ color: C.green, fontSize: 12, fontWeight: '700' }}>🖼️ {selectedImage ? 'Đã chọn ảnh' : 'Thêm ảnh'}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[s.submitBtn, posting && { opacity: 0.6 }]} onPress={handlePost} disabled={posting}>
                {posting ? <ActivityIndicator color="#0a0e0a" /> : <Text style={s.submitText}>📤 ĐĂNG BÀI</Text>}
              </TouchableOpacity>
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
  filterRow: { borderBottomWidth: 1, borderColor: C.border, flexGrow: 0 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  filterBtnActive: { backgroundColor: C.green, borderColor: C.green },
  filterText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#0a0e0a' },
  postCard: { backgroundColor: C.card, borderBottomWidth: 1, borderColor: C.border, padding: 16 },
  postHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  postAvatar: { width: 36, height: 36, backgroundColor: C.greenDark, alignItems: 'center', justifyContent: 'center' },
  postAuthor: { fontSize: 14, fontWeight: '800', color: C.text },
  postDate: { fontSize: 11, color: C.muted },
  typeBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  postTitle: { fontSize: 17, fontWeight: '900', color: C.text, marginBottom: 8 },
  postContent: { fontSize: 14, color: C.muted, lineHeight: 22, marginBottom: 12 },
  postImage: { width: '100%', aspectRatio: 16 / 9, marginBottom: 12 },
  fileCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 12, gap: 10 },
  fileIcon: { fontSize: 24 },
  fileName: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 },
  fileSize: { fontSize: 11, color: C.muted },
  postActions: { flexDirection: 'row', gap: 20, paddingTop: 12, borderTopWidth: 1, borderColor: C.border2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 16 },
  actionText: { fontSize: 13, color: C.muted, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 16, color: C.muted, fontWeight: '700' },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, backgroundColor: C.green,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
  },
  fabText: { fontSize: 28, color: '#0a0e0a', fontWeight: '900', lineHeight: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modal: { backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border, maxHeight: '90%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderColor: C.border },
  modalTitle: { fontSize: 12, fontWeight: '900', color: C.green, letterSpacing: 1 },
  formLabel: { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 2, marginBottom: 8 },
  formInput: { borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, color: C.text, padding: 12, fontSize: 14, marginBottom: 20 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  typeBtnActive: { backgroundColor: C.green, borderColor: C.green },
  typeBtnText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  attachBtn: { borderWidth: 1, borderColor: C.border, padding: 10 },
  submitBtn: { backgroundColor: C.green, padding: 16, alignItems: 'center', marginBottom: 32 },
  submitText: { color: '#0a0e0a', fontWeight: '900', fontSize: 13 },
});
