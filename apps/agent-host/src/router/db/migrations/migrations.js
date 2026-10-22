import journal from './meta/_journal.json';
import m0000 from './0000_router.sql';
import m0001 from './0001_host_sender_setup.sql';
import m0002 from './0002_pending_subscriptions.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002
    }
  }
  