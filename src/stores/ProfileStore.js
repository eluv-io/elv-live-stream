// Manages the Live Recording Config profiles
class ProfileStore {
  constructor(rootStore) {
    this.rootStore = rootStore;
  }

  get client() {
    return this.rootStore.client;
  }
}

export default ProfileStore;
