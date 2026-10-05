import journal from './meta/_journal.json';
import m0000 from './0000_initialize.sql';
import m0001 from './0001_initialize_host.sql';
import m0002 from './0002_normalized_chat_storage.sql';
import m0003 from './0003_replay_bytes.sql';
import m0004 from './0004_initialize_replay_bytes.sql';
import m0005 from './0005_escaped_storage_pieces.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005
    }
  }
  