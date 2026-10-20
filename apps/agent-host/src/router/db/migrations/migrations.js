import journal from './meta/_journal.json';
import m0000 from './0000_router.sql';
import m0001 from './0001_host_sender_setup.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001
    }
  }
  