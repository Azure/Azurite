# coding: UTF-8
__author__ = 'xiaonli'

import MySQLdb
import time

host = '127.0.0.1'
user = 'root'
passwd = 'my-secret-pw'
db = 'azurite_blob_metadata'
port = 3306

conn = MySQLdb.connect(host, user, passwd, db, port)
conn.autocommit = False
cur = conn.cursor()

# Insert 10000 rows
count = 10000

# start_time = time.time()
# for x in xrange(count):
#     print x
#     sql = "INSERT INTO `azurite_blob_metadata`.`Tests` (`blobName`, `blockList`) VALUES ('%s', 'list%s')" % (
#         x, x)
#     cur.execute(sql)
#     conn.commit()
# end_time = time.time()
# print 'Time', (end_time - start_time) * 1000, 'ms'

# Update 10000 rows, single row commit, 1 db connection, 141078ms
# Update 10000 rows, total one commit, 1 db connection, 62808ms
# Update 5 * 2000 rows, total 5 commit, 5 db connection, 63914ms

start_time = time.time()
# for x in xrange(count):
#     # print x
#     sql = "UPDATE Tests SET blockList=%s where blobName=%s" % (x+2, x)
#     cur.execute(sql)


def update(int_iter):
    conn = MySQLdb.connect(host, user, passwd, db, port)
    conn.autocommit = False
    cur = conn.cursor()
    for x in int_iter:
        print x
        sql = "UPDATE Tests SET blockList=%s where blobName=%s" % (x+2, x)
        cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()


pool = multiprocessing.Pool(processes=5)

pool.apply_async(update, (xrange(2000), ))
pool.apply_async(update, (xrange(2000, 4000), ))
pool.apply_async(update, (xrange(4000, 6000), ))
pool.apply_async(update, (xrange(6000, 8000), ))
pool.apply_async(update, (xrange(8000, 10000), ))

pool.close()
pool.join()

end_time = time.time()
print 'Time', (end_time - start_time) * 1000, 'ms'
