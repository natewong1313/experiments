import journal from './meta/_journal.json';
import m0000 from './0000_session.sql';
import m0001 from './0001_subscriber_cleanup.sql';
import m0002 from './0002_conversation_records.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002
    }
  }
  